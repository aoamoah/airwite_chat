'use client';

import * as React from 'react';
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { selectHand } from './features';

/**
 * Frames per second the tracker samples at.
 *
 * This is not a performance dial. The models count frames, not seconds — a
 * 30-frame window is one second only if frames arrive at 30fps. Sampling faster
 * would shrink the window's real duration and show the model motion at a speed
 * it never saw in training.
 */
export const SAMPLE_FPS = 30;

export type HandFrame = {
  /** The tracked hand, or null when it was not visible this frame. */
  landmarks: NormalizedLandmark[] | null;
  /** Milliseconds, monotonically increasing, as MediaPipe VIDEO mode requires. */
  timestampMs: number;
  /** Wall-clock cost of this detection, for the performance readout. */
  detectMs: number;
};

export type HandTrackerStatus = 'idle' | 'loading' | 'running' | 'error';

/**
 * Runs MediaPipe hand tracking over a camera track and reports the tracked hand
 * once per sample.
 *
 * Frames come from a dedicated <video> fed by the track directly, not from the
 * tile: the tile can be unmounted by layout changes, and its pixels are mirrored
 * by CSS. The raw track is stable and unmirrored, matching how the training
 * videos were captured. That element still has to live in the document — see
 * below.
 */
export function useHandTracker(
  mediaStreamTrack: MediaStreamTrack | undefined,
  onFrame: (frame: HandFrame) => void,
  enabled: boolean,
): {
  status: HandTrackerStatus;
  error: string | null;
  delegate: 'GPU' | 'CPU' | null;
  delegateError: string | null;
} {
  const [status, setStatus] = React.useState<HandTrackerStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [delegate, setDelegate] = React.useState<'GPU' | 'CPU' | null>(null);
  /** Why the GPU delegate was refused, when it was. */
  const [delegateError, setDelegateError] = React.useState<string | null>(null);

  const onFrameRef = React.useRef(onFrame);
  onFrameRef.current = onFrame;

  React.useEffect(() => {
    if (!enabled || !mediaStreamTrack) {
      setStatus('idle');
      return;
    }

    let disposed = false;
    let landmarker: HandLandmarker | null = null;
    let raf = 0;
    let lastSampleAt = 0;
    let lastTimestamp = -1;

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = new MediaStream([mediaStreamTrack]);
    // Must be in the document to decode at full rate. Browsers throttle or stop
    // updating detached elements, and `display: none` / `visibility: hidden`
    // count as detached for this purpose — which starves the detector of fresh
    // frames and looks exactly like a slow model. A 1px transparent element is
    // the smallest thing that still decodes.
    Object.assign(video.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(video);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!landmarker || video.readyState < 2) return;

      const now = performance.now();
      if (now - lastSampleAt < 1000 / SAMPLE_FPS) return;
      lastSampleAt = now;

      // VIDEO mode rejects repeated or out-of-order timestamps outright.
      const timestampMs = Math.max(Math.round(now), lastTimestamp + 1);
      lastTimestamp = timestampMs;

      try {
        const startedAt = performance.now();
        const result = landmarker.detectForVideo(video, timestampMs);
        onFrameRef.current({
          landmarks: selectHand(result.landmarks, result.handedness),
          timestampMs,
          detectMs: performance.now() - startedAt,
        });
      } catch (cause) {
        // A single bad frame should not tear down tracking for the session.
        console.warn('[airwriting] hand detection failed for a frame', cause);
      }
    };

    const start = async () => {
      setStatus('loading');
      setError(null);
      try {
        await video.play();
        // Imported lazily: this package touches browser globals on load, which
        // crashes Next's build worker when it evaluates client modules on the
        // server, and it is far too large to sit in everyone's initial chunk.
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        if (disposed) return;

        const options = (delegate: 'GPU' | 'CPU') => ({
          baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
          runningMode: 'VIDEO' as const,
          // Matching the collector's extractor settings exactly.
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // GPU is the difference between roughly real time and a detector that
        // cannot keep up: landmarking on CPU can exceed the whole 33ms frame
        // budget on its own, and it runs on the main thread, so it drags the
        // rest of the call down with it. Fall back if WebGL is unavailable.
        try {
          landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
          setDelegate('GPU');
        } catch (cause) {
          console.warn('[airwriting] GPU delegate unavailable, falling back to CPU', cause);
          setDelegateError(cause instanceof Error ? cause.message : String(cause));
          landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
          setDelegate('CPU');
        }
        if (disposed) {
          landmarker.close();
          return;
        }
        setStatus('running');
        raf = requestAnimationFrame(loop);
      } catch (cause) {
        if (disposed) return;
        console.error('[airwriting] tracker failed to start', cause);
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    };

    void start();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      landmarker?.close();
      video.pause();
      video.srcObject = null;
      video.remove();
    };
  }, [mediaStreamTrack, enabled]);

  return { status, error, delegate, delegateError };
}
