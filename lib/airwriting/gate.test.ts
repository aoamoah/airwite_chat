import { describe, expect, it } from 'vitest';
import { WritingGate } from './gate';

/** Feeds a run of probabilities and returns the final state. */
function feed(gate: WritingGate, values: number[]): boolean {
  let state = gate.isWriting;
  for (const value of values) state = gate.push(value);
  return state;
}

describe('WritingGate', () => {
  it('starts closed', () => {
    expect(new WritingGate().isWriting).toBe(false);
  });

  it('ignores a single confident spike', () => {
    const gate = new WritingGate({ dwellFrames: 3 });
    expect(gate.push(0.99)).toBe(false);
  });

  it('opens once the signal holds past the dwell', () => {
    const gate = new WritingGate({ dwellFrames: 3 });
    expect(feed(gate, [0.9, 0.9, 0.9])).toBe(true);
  });

  it('requires the dwell to be consecutive', () => {
    const gate = new WritingGate({ dwellFrames: 3 });
    // Two high, one low, two high: never three in a row.
    expect(feed(gate, [0.9, 0.9, 0.1, 0.9, 0.9])).toBe(false);
  });

  it('stays open between the two thresholds', () => {
    const gate = new WritingGate({ enter: 0.6, exit: 0.4, dwellFrames: 1 });
    feed(gate, [0.9]);
    // 0.5 is below enter but above exit — chattering territory for one threshold.
    expect(feed(gate, [0.5, 0.5, 0.5, 0.5])).toBe(true);
  });

  it('closes only once the signal falls past the exit threshold', () => {
    const gate = new WritingGate({ enter: 0.6, exit: 0.4, dwellFrames: 1 });
    feed(gate, [0.9]);
    expect(feed(gate, [0.3])).toBe(false);
  });

  it('does not reopen on a signal that merely stops falling', () => {
    const gate = new WritingGate({ enter: 0.6, exit: 0.4, dwellFrames: 1 });
    feed(gate, [0.9, 0.3]);
    expect(feed(gate, [0.5, 0.55])).toBe(false);
  });

  it('survives a full open and close cycle', () => {
    const gate = new WritingGate({ enter: 0.6, exit: 0.4, dwellFrames: 2 });
    expect(feed(gate, [0.8, 0.8])).toBe(true);
    expect(feed(gate, [0.1, 0.1])).toBe(false);
    expect(feed(gate, [0.8, 0.8])).toBe(true);
  });

  it('forces closed on reset', () => {
    const gate = new WritingGate({ dwellFrames: 1 });
    feed(gate, [0.9]);
    gate.reset();
    expect(gate.isWriting).toBe(false);
  });

  it('rejects thresholds that would invert the hysteresis', () => {
    expect(() => new WritingGate({ enter: 0.3, exit: 0.7 })).toThrow(/exit threshold/);
  });
});
