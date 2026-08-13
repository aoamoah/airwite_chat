/**
 * Cuts a continuous microphone signal into utterances.
 *
 * The transcription API takes a finished clip and returns finished text, so
 * something has to decide where one clip ends. Slicing on a fixed timer is the
 * obvious approach and the wrong one: it cuts words in half, and the model then
 * mis-transcribes both halves. Cutting at the pauses a speaker already leaves
 * gives the model whole phrases, which is what it was trained on.
 */

export type SegmenterOptions = {
  /** Loudness at or above which a frame counts as speech, 0..1. */
  speechThreshold?: number;
  /** Silence held this long ends the utterance. */
  hangoverMs?: number;
  /** Utterances shorter than this are discarded as coughs, clicks, and knocks. */
  minUtteranceMs?: number;
  /**
   * An utterance is cut here even mid-sentence. Someone who talks without
   * pausing would otherwise never produce a caption at all, and the upload
   * would grow without bound.
   */
  maxUtteranceMs?: number;
};

export const DEFAULT_SEGMENTER: Required<SegmenterOptions> = {
  speechThreshold: 0.02,
  hangoverMs: 700,
  minUtteranceMs: 400,
  maxUtteranceMs: 10_000,
};

export type SegmentEvent =
  /** Nothing is happening. */
  | { type: 'idle' }
  /** An utterance began on this frame. */
  | { type: 'start' }
  /** Still speaking. */
  | { type: 'speaking' }
  /** An utterance finished and should be transcribed. */
  | { type: 'end'; startedAt: number; endedAt: number; reason: 'pause' | 'maxLength' }
  /** An utterance finished but was too short to be worth sending. */
  | { type: 'discard'; startedAt: number; endedAt: number };

export class UtteranceSegmenter {
  private readonly options: Required<SegmenterOptions>;
  private speaking = false;
  private startedAt = 0;
  /** When the current run of silence began, or null while sound continues. */
  private silenceSince: number | null = null;

  constructor(options: SegmenterOptions = {}) {
    this.options = { ...DEFAULT_SEGMENTER, ...options };
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Feeds one frame of loudness and returns what it means.
   *
   * `level` is any 0..1 measure of frame energy; RMS is what the caller uses.
   * `atMs` is a monotonic timestamp for the frame.
   */
  push(level: number, atMs: number): SegmentEvent {
    const loud = level >= this.options.speechThreshold;

    if (!this.speaking) {
      if (!loud) return { type: 'idle' };
      this.speaking = true;
      this.startedAt = atMs;
      this.silenceSince = null;
      return { type: 'start' };
    }

    if (loud) {
      this.silenceSince = null;
    } else if (this.silenceSince === null) {
      this.silenceSince = atMs;
    }

    const heldSilence =
      this.silenceSince !== null && atMs - this.silenceSince >= this.options.hangoverMs;
    const tooLong = atMs - this.startedAt >= this.options.maxUtteranceMs;
    if (!heldSilence && !tooLong) return { type: 'speaking' };

    // A pause ends the utterance where the sound stopped, not where the pause
    // was confirmed, so trailing silence is not uploaded.
    const endedAt = heldSilence ? (this.silenceSince as number) : atMs;
    const startedAt = this.startedAt;
    this.reset();

    if (endedAt - startedAt < this.options.minUtteranceMs) {
      return { type: 'discard', startedAt, endedAt };
    }
    return { type: 'end', startedAt, endedAt, reason: heldSilence ? 'pause' : 'maxLength' };
  }

  /** Abandons any utterance in progress, e.g. when the microphone is muted. */
  reset(): void {
    this.speaking = false;
    this.startedAt = 0;
    this.silenceSince = null;
  }
}

/** Root-mean-square level of a frame, as a 0..1 figure. */
export function frameLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
