/**
 * Turns the model's probability stream into a writing/not-writing decision.
 *
 * A single threshold would chatter: probabilities hovering near it flip state
 * every few frames, which in a drawing tool means a stroke shattered into
 * fragments. A Schmitt trigger needs the signal to travel a real distance
 * before reversing, and a dwell requirement stops a one-frame spike from
 * starting a stroke at all.
 */
export type WritingGateOptions = {
  /** Probability at or above which writing may start. */
  enter?: number;
  /** Probability at or below which writing stops. */
  exit?: number;
  /** Consecutive frames past the threshold required before the state flips. */
  dwellFrames?: number;
};

export const DEFAULT_GATE: Required<WritingGateOptions> = {
  enter: 0.6,
  exit: 0.4,
  dwellFrames: 2,
};

export class WritingGate {
  private readonly options: Required<WritingGateOptions>;
  private writing = false;
  private streak = 0;

  constructor(options: WritingGateOptions = {}) {
    this.options = { ...DEFAULT_GATE, ...options };
    if (this.options.exit > this.options.enter) {
      throw new Error('exit threshold must not exceed enter threshold');
    }
  }

  get isWriting(): boolean {
    return this.writing;
  }

  /** Feeds one probability and returns the resulting state. */
  push(probability: number): boolean {
    const crossed = this.writing
      ? probability <= this.options.exit
      : probability >= this.options.enter;

    if (!crossed) {
      this.streak = 0;
      return this.writing;
    }

    this.streak++;
    if (this.streak >= this.options.dwellFrames) {
      this.writing = !this.writing;
      this.streak = 0;
    }
    return this.writing;
  }

  /** Forces the gate closed, e.g. when the hand leaves or tracking stops. */
  reset(): void {
    this.writing = false;
    this.streak = 0;
  }
}
