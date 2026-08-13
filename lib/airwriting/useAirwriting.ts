'use client';

import * as React from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { WritingClassifier, type ModelInfo } from './classifier';
import { extractFeatures, FEATURE_COUNT, INDEX_FINGERTIP } from './features';
import { WritingGate, type WritingGateOptions } from './gate';
import { useHandTracker, type HandFrame, type HandTrackerStatus } from './useHandTracker';
import { FeatureWindow } from './window';

export type AirwritingPoint = { x: number; y: number };

export type AirwritingCallbacks = {
  /** Rising edge of "writing" — the event the annotation protocol calls `begin`. */
  onBegin: (point: AirwritingPoint) => void;
  onExtend: (point: AirwritingPoint) => void;
  /** Falling edge — the `end` event. */
  onEnd: () => void;
};

export type AirwritingState = {
  status: HandTrackerStatus;
  error: string | null;
  /** Latest probability from the model, or null before the first full window. */
  probability: number | null;
  isWriting: boolean;
  /** Whether a hand was visible in the most recent sample. */
  handVisible: boolean;
  /** Which MediaPipe backend is in use — CPU here means something went wrong. */
  delegate: 'GPU' | 'CPU' | null;
  /** Why the GPU delegate was refused, when it was. */
  delegateError: string | null;
  /** Rolling averages, in milliseconds, of the two costs per sampled frame. */
  detectMs: number;
  inferMs: number;
};

/**
 * How often the readout is refreshed. The pipeline samples at 30fps, but
 * re-rendering React that often just to move a meter would cost more than the
 * inference does — and would do it on the same main thread the detector needs.
 */
const UI_REFRESH_HZ = 8;

/** Exponential smoothing factor for the timing averages. */
const TIMING_SMOOTHING = 0.1;

export type AirwritingOptions = {
  enabled: boolean;
  /** Which staged model to run; null while the manifest is still loading. */
  model: ModelInfo | null;
  gate?: WritingGateOptions;
};

/**
 * Drives the pen from hand motion.
 *
 * Pipeline: camera track -> MediaPipe landmarks -> 64 features -> sliding window
 * -> LSTM -> hysteresis gate -> begin/extend/end.
 *
 * Two consequences of the model being windowed are worth knowing. It cannot say
 * anything until it has seen a full window, so the pen is inert for the first
 * ~0.5-2s of tracking. And its verdict describes the window just gone, so a
 * stroke is recognised only after it is already underway — which is why the
 * fingertip trail is kept and replayed on the rising edge, rather than starting
 * the stroke at the point where the model happened to make up its mind.
 */
export function useAirwriting(
  options: AirwritingOptions,
  callbacks: AirwritingCallbacks,
): AirwritingState {
  const { enabled, model } = options;
  const { cameraTrack } = useLocalParticipant();
  const mediaStreamTrack = cameraTrack?.track?.mediaStreamTrack;

  const [status, setStatus] = React.useState<HandTrackerStatus>('idle');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Everything the readout shows is written on the hot path and read on a timer,
  // so none of it lives in React state until it is time to paint.
  const live = React.useRef({
    probability: null as number | null,
    isWriting: false,
    handVisible: false,
    detectMs: 0,
    inferMs: 0,
  });
  const [readout, setReadout] = React.useState(live.current);

  const callbacksRef = React.useRef(callbacks);
  callbacksRef.current = callbacks;

  const classifierRef = React.useRef<WritingClassifier | null>(null);
  const windowRef = React.useRef<FeatureWindow | null>(null);
  const gateRef = React.useRef<WritingGate | null>(null);
  const featureBuffer = React.useRef(new Float32Array(FEATURE_COUNT));
  // Handed to ORT by reference and read asynchronously, so it may only be
  // rewritten once the previous run has resolved — which `inFlight` guarantees.
  const inputBuffer = React.useRef<Float32Array | null>(null);
  // Fingertips for the frames currently in the window, used to recover the
  // start of a stroke once the model confirms it.
  const trail = React.useRef<(AirwritingPoint | null)[]>([]);
  const inFlight = React.useRef(false);
  const writingRef = React.useRef(false);

  const gateOptions = options.gate;
  React.useEffect(() => {
    if (!enabled || !model) return;

    let disposed = false;
    windowRef.current = new FeatureWindow(model.windowSize);
    gateRef.current = new WritingGate(gateOptions);
    inputBuffer.current = new Float32Array(model.windowSize * FEATURE_COUNT);
    trail.current = [];
    writingRef.current = false;
    live.current = {
      probability: null,
      isWriting: false,
      handVisible: false,
      detectMs: 0,
      inferMs: 0,
    };
    setLoadError(null);

    WritingClassifier.load(model)
      .then((classifier) => {
        if (disposed) {
          void classifier.dispose();
          return;
        }
        classifierRef.current = classifier;
      })
      .catch((cause) => {
        if (disposed) return;
        console.error('[airwriting] failed to load model', cause);
        setLoadError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      disposed = true;
      const classifier = classifierRef.current;
      classifierRef.current = null;
      void classifier?.dispose();
      // A stroke left open when the feature is switched off would never close.
      if (writingRef.current) {
        writingRef.current = false;
        callbacksRef.current.onEnd();
      }
    };
  }, [enabled, model, gateOptions]);

  const handleFrame = React.useCallback(
    (frame: HandFrame) => {
      const window = windowRef.current;
      const gate = gateRef.current;
      if (!window || !gate) return;

      const point = frame.landmarks
        ? {
            x: frame.landmarks[INDEX_FINGERTIP].x,
            y: frame.landmarks[INDEX_FINGERTIP].y,
          }
        : null;
      live.current.handVisible = point !== null;
      live.current.detectMs +=
        (frame.detectMs - live.current.detectMs) * TIMING_SMOOTHING;

      window.push(extractFeatures(frame.landmarks, featureBuffer.current));
      trail.current.push(point);
      if (trail.current.length > window.size) trail.current.shift();

      // While writing, follow the finger immediately — waiting on the model
      // here would make the line lag behind the hand by a whole window.
      if (writingRef.current && point) {
        callbacksRef.current.onExtend(point);
      }

      const classifier = classifierRef.current;
      // Inference is fast, but never queue a second run behind a slow one.
      if (!classifier || !window.filled || inFlight.current) return;

      const input = inputBuffer.current;
      if (!input) return;

      inFlight.current = true;
      // Copy into the dedicated buffer rather than allocating: at 30fps a fresh
      // window would be a few hundred KB per second straight into the nursery.
      input.set(window.toInput());
      const startedAt = performance.now();
      classifier
        .predict(input)
        .then((value) => {
          live.current.inferMs +=
            (performance.now() - startedAt - live.current.inferMs) * TIMING_SMOOTHING;
          live.current.probability = value;
          const nowWriting = gate.push(value);
          if (nowWriting === writingRef.current) return;

          writingRef.current = nowWriting;
          live.current.isWriting = nowWriting;

          if (nowWriting) {
            // Replay the window: the hand was already writing throughout it.
            const points = trail.current.filter((p): p is AirwritingPoint => p !== null);
            if (points.length === 0) {
              writingRef.current = false;
              live.current.isWriting = false;
              return;
            }
            callbacksRef.current.onBegin(points[0]);
            for (let i = 1; i < points.length; i++) {
              callbacksRef.current.onExtend(points[i]);
            }
          } else {
            callbacksRef.current.onEnd();
          }
        })
        .catch((cause) => console.warn('[airwriting] inference failed', cause))
        .finally(() => {
          inFlight.current = false;
        });
    },
    [],
  );

  const tracker = useHandTracker(mediaStreamTrack, handleFrame, enabled);

  React.useEffect(() => {
    setStatus(tracker.status);
  }, [tracker.status]);

  // Losing the hand should put the pen down rather than leave a stroke hanging.
  React.useEffect(() => {
    if (status === 'running' || !writingRef.current) return;
    writingRef.current = false;
    live.current.isWriting = false;
    callbacksRef.current.onEnd();
  }, [status]);

  // Publish the readout on a slow timer instead of per frame.
  React.useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(
      () => setReadout({ ...live.current }),
      1000 / UI_REFRESH_HZ,
    );
    return () => clearInterval(timer);
  }, [enabled]);

  return {
    status,
    error: loadError ?? tracker.error,
    delegate: tracker.delegate,
    delegateError: tracker.delegateError,
    ...readout,
  };
}
