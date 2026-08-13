import { FEATURE_COUNT } from './features';

/**
 * Fixed-length sliding window of feature frames, matching the `size` axis of
 * the trained models' input.
 *
 * A ring buffer over one flat Float32Array: the classifier runs on every frame
 * once primed, so this is the hottest allocation site in the pipeline and there
 * is no reason for it to allocate at all.
 */
export class FeatureWindow {
  private readonly buffer: Float32Array;
  private readonly scratch: Float32Array;
  private head = 0;
  private count = 0;

  constructor(
    readonly size: number,
    private readonly featureCount = FEATURE_COUNT,
  ) {
    if (size <= 0) throw new Error('window size must be positive');
    this.buffer = new Float32Array(size * featureCount);
    this.scratch = new Float32Array(size * featureCount);
  }

  push(frame: Float32Array): void {
    if (frame.length !== this.featureCount) {
      throw new Error(`expected ${this.featureCount} features, got ${frame.length}`);
    }
    this.buffer.set(frame, this.head * this.featureCount);
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /** The model cannot be run until a full window has been seen. */
  get filled(): boolean {
    return this.count === this.size;
  }

  /** Drops everything, e.g. when tracking is interrupted and continuity breaks. */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }

  /**
   * The window in chronological order, oldest first.
   *
   * Returns a view onto a reused buffer — copy it if you need to keep it past
   * the next call.
   */
  toInput(): Float32Array {
    if (!this.filled) throw new Error('window is not full yet');
    // Oldest frame sits at head once the buffer has wrapped.
    const split = this.head * this.featureCount;
    this.scratch.set(this.buffer.subarray(split), 0);
    this.scratch.set(this.buffer.subarray(0, split), this.buffer.length - split);
    return this.scratch;
  }
}
