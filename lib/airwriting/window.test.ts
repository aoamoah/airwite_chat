import { describe, expect, it } from 'vitest';
import { FeatureWindow } from './window';

/** Frames are tagged by their first value so ordering is observable. */
function frame(tag: number, size: number): Float32Array {
  return new Float32Array(size).fill(tag);
}

describe('FeatureWindow', () => {
  it('is not runnable until a full window has been seen', () => {
    const window = new FeatureWindow(3, 2);
    expect(window.filled).toBe(false);
    window.push(frame(1, 2));
    window.push(frame(2, 2));
    expect(window.filled).toBe(false);
    window.push(frame(3, 2));
    expect(window.filled).toBe(true);
  });

  it('refuses to produce input before it is full', () => {
    const window = new FeatureWindow(2, 2);
    window.push(frame(1, 2));
    expect(() => window.toInput()).toThrow(/not full/);
  });

  it('rejects frames of the wrong width', () => {
    const window = new FeatureWindow(2, 4);
    expect(() => window.push(frame(1, 3))).toThrow(/expected 4 features/);
  });

  it('returns frames oldest first', () => {
    const window = new FeatureWindow(3, 1);
    window.push(frame(1, 1));
    window.push(frame(2, 1));
    window.push(frame(3, 1));
    expect(Array.from(window.toInput())).toEqual([1, 2, 3]);
  });

  it('keeps chronological order after the ring wraps', () => {
    const window = new FeatureWindow(3, 1);
    for (const tag of [1, 2, 3, 4, 5]) window.push(frame(tag, 1));
    // Oldest two have been overwritten; the rest stay in order.
    expect(Array.from(window.toInput())).toEqual([3, 4, 5]);
  });

  it('keeps multi-feature frames contiguous and in order', () => {
    const window = new FeatureWindow(2, 3);
    window.push(new Float32Array([1, 2, 3]));
    window.push(new Float32Array([4, 5, 6]));
    window.push(new Float32Array([7, 8, 9]));
    expect(Array.from(window.toInput())).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('goes back to empty on reset', () => {
    const window = new FeatureWindow(2, 1);
    window.push(frame(1, 1));
    window.push(frame(2, 1));
    window.reset();
    expect(window.filled).toBe(false);
    window.push(frame(7, 1));
    window.push(frame(8, 1));
    expect(Array.from(window.toInput())).toEqual([7, 8]);
  });

  it('rejects a nonsensical size up front', () => {
    expect(() => new FeatureWindow(0)).toThrow(/positive/);
  });
});
