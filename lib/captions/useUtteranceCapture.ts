'use client';

import * as React from 'react';
import { UtteranceSegmenter, frameLevel } from './segmenter';
import { TARGET_SAMPLE_RATE, downsample, encodeWav, preferredRecordingType } from './wav';

const WORKLET_URL = '/worklets/pcm-capture.js';

/**
 * Audio kept from just before speech was detected.
 *
 * Detection needs a frame or two of sound to fire, by which time the start of
 * the word is already past. Without this the model receives clips beginning
 * mid-consonant and mis-hears the first word of nearly every sentence.
 */
const PRE_ROLL_MS = 300;

/**
 * Refuses to grow without bound if an utterance never ends. Comfortably above
 * the segmenter's own cut-off, which is what actually ends utterances.
 */
const MAX_BUFFER_MS = 8_000;

export type Utterance = {
  /** What to send. Opus where the browser could record it, otherwise the WAV. */
  audio: Blob;
  /**
   * The same speech as WAV, present only when `audio` is a compressed recording
   * the service might refuse. Costs nothing to keep — it was captured anyway to
   * detect speech — and turns a rejection into one retry instead of a lost
   * caption.
   */
  fallback?: Blob;
  /** Seconds of speech, for reporting what a caption cost to produce. */
  durationSec: number;
};

export type CaptureStatus = 'idle' | 'starting' | 'listening' | 'unsupported' | 'error';

export type CaptureState = {
  status: CaptureStatus;
  error: string | null;
  /** True while the speaker is mid-utterance. */
  speaking: boolean;
};

/**
 * Turns a live microphone into finished utterances, ready to transcribe.
 *
 * Runs only while `enabled`; nothing is captured, and no audio context is
 * created, when captions are off.
 */
export function useUtteranceCapture(
  track: MediaStreamTrack | undefined,
  enabled: boolean,
  onUtterance: (utterance: Utterance) => void,
): CaptureState {
  const [status, setStatus] = React.useState<CaptureStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [speaking, setSpeaking] = React.useState(false);

  const onUtteranceRef = React.useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  React.useEffect(() => {
    if (!enabled || !track) {
      setStatus('idle');
      setSpeaking(false);
      return;
    }

    if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
      setStatus('unsupported');
      setError('This browser cannot capture audio for captions.');
      return;
    }

    let disposed = false;
    let context: AudioContext | null = null;
    let node: AudioWorkletNode | null = null;
    // Assigned once the pipeline is up. The recorder is attached to the track,
    // not the audio context, so closing the context does not stop it.
    let abandonRecording: (() => void) | null = null;

    setStatus('starting');
    setError(null);

    void (async () => {
      try {
        context = new AudioContext();
        await context.audioWorklet.addModule(WORKLET_URL);
        if (disposed) return;

        const stream = new MediaStream([track]);
        const source = context.createMediaStreamSource(stream);
        node = new AudioWorkletNode(context, 'pcm-capture');

        /**
         * An Opus recording of the same speech, roughly an eighth the size.
         *
         * Run alongside the sample capture rather than instead of it: the
         * samples are needed to detect speech at all, so the WAV comes free,
         * and having both means an unsupported container costs a retry rather
         * than a caption.
         */
        const recordingType = preferredRecordingType();
        let recorder: MediaRecorder | null = null;
        let chunks: Blob[] = [];

        const startRecording = () => {
          if (!recordingType) return;
          try {
            recorder = new MediaRecorder(stream, { mimeType: recordingType });
            chunks = [];
            recorder.ondataavailable = (event) => {
              if (event.data.size > 0) chunks.push(event.data);
            };
            recorder.start();
          } catch (cause) {
            console.error('[captions] could not record Opus, using WAV', cause);
            recorder = null;
          }
        };

        const stopRecording = (): Promise<Blob | null> =>
          new Promise((resolve) => {
            const active = recorder;
            recorder = null;
            if (!active || active.state === 'inactive') return resolve(null);
            active.onstop = () => {
              resolve(chunks.length > 0 ? new Blob(chunks, { type: active.mimeType }) : null);
              chunks = [];
            };
            try {
              active.stop();
            } catch {
              resolve(null);
            }
          });

        const rate = context.sampleRate;
        const segmenter = new UtteranceSegmenter();
        // Frames held for the current utterance, plus a little of what came
        // before it.
        let collecting: Float32Array[] = [];
        const preRoll: Float32Array[] = [];
        let preRollSamples = 0;
        const preRollLimit = Math.round((rate * PRE_ROLL_MS) / 1000);
        const maxSamples = Math.round((rate * MAX_BUFFER_MS) / 1000);
        let collected = 0;
        let elapsedMs = 0;

        const concat = (chunks: Float32Array[], total: number) => {
          const out = new Float32Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
          }
          return out;
        };

        node.port.onmessage = (event: MessageEvent<Float32Array>) => {
          const frame = event.data;
          const level = frameLevel(frame);
          elapsedMs += (frame.length / rate) * 1000;
          const decision = segmenter.push(level, elapsedMs);

          if (decision.type === 'start') {
            setSpeaking(true);
            collecting = [...preRoll];
            collected = preRollSamples;
            startRecording();
          }

          if (segmenter.isSpeaking || decision.type === 'end' || decision.type === 'discard') {
            if (collected < maxSamples) {
              collecting.push(frame);
              collected += frame.length;
            }
          } else {
            // Idle: keep only enough recent audio to cover the pre-roll.
            preRoll.push(frame);
            preRollSamples += frame.length;
            while (preRollSamples > preRollLimit && preRoll.length > 1) {
              preRollSamples -= (preRoll.shift() as Float32Array).length;
            }
          }

          if (decision.type === 'end' || decision.type === 'discard') {
            setSpeaking(false);
            const captured = concat(collecting, collected);
            const wanted = decision.type === 'end' && captured.length > 0;
            collecting = [];
            collected = 0;
            preRoll.length = 0;
            preRollSamples = 0;

            void stopRecording().then((recorded) => {
              if (disposed || !wanted) return;
              const reduced = downsample(captured, rate, TARGET_SAMPLE_RATE);
              const wav = encodeWav(reduced, TARGET_SAMPLE_RATE);
              onUtteranceRef.current({
                audio: recorded ?? wav,
                fallback: recorded ? wav : undefined,
                durationSec: reduced.length / TARGET_SAMPLE_RATE,
              });
            });
          }
        };

        abandonRecording = () => {
          try {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
          } catch {
            // Already stopped, which is the state we wanted.
          }
          recorder = null;
        };

        source.connect(node);
        // Not connected to the destination: this only listens. Routing it to
        // the speakers would echo the speaker back to themselves.
        if (context.state === 'suspended') await context.resume();
        if (disposed) return;
        setStatus('listening');
      } catch (cause) {
        if (disposed) return;
        console.error('[captions] could not start listening', cause);
        setStatus('error');
        setError('Captions could not start on this device.');
      }
    })();

    return () => {
      disposed = true;
      setSpeaking(false);
      abandonRecording?.();
      if (node) {
        node.port.onmessage = null;
        node.disconnect();
      }
      void context?.close().catch(() => {});
    };
  }, [track, enabled]);

  return { status, error, speaking };
}
