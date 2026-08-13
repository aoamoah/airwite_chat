import { ConnectionQuality } from 'livekit-client';
import { describe, expect, it } from 'vitest';
import {
  LOST_DWELL_MS,
  POOR_DWELL_MS,
  SUSTAINED_POOR_DWELL_MS,
  dwellRequired,
  isDegraded,
  nextDegradedMode,
} from './degrade';
import { isCheaper, modeRank } from './types';

const { Excellent, Good, Poor, Lost, Unknown } = ConnectionQuality;

describe('nextDegradedMode', () => {
  it('does nothing while the connection is healthy', () => {
    for (const quality of [Excellent, Good, Unknown]) {
      expect(nextDegradedMode({ mode: 'full', quality, sustainedMs: 60_000 })).toBeNull();
    }
  });

  it('ignores a brief dip', () => {
    expect(
      nextDegradedMode({ mode: 'full', quality: Poor, sustainedMs: POOR_DWELL_MS - 1 }),
    ).toBeNull();
  });

  it('drops to low video once Poor holds', () => {
    expect(nextDegradedMode({ mode: 'full', quality: Poor, sustainedMs: POOR_DWELL_MS })).toBe(
      'low',
    );
  });

  it('gives up on video when low is still not enough', () => {
    expect(
      nextDegradedMode({ mode: 'low', quality: Poor, sustainedMs: SUSTAINED_POOR_DWELL_MS }),
    ).toBe('audio-only');
  });

  it('does not jump straight to audio-only on a first Poor reading', () => {
    expect(nextDegradedMode({ mode: 'full', quality: Poor, sustainedMs: 60_000 })).toBe('low');
  });

  it('goes to audio-only when the connection is lost', () => {
    expect(nextDegradedMode({ mode: 'full', quality: Lost, sustainedMs: LOST_DWELL_MS })).toBe(
      'audio-only',
    );
  });

  it('confirms Lost briefly before acting', () => {
    expect(
      nextDegradedMode({ mode: 'full', quality: Lost, sustainedMs: LOST_DWELL_MS - 1 }),
    ).toBeNull();
  });

  it('never steps back up, however good things get', () => {
    for (const quality of [Excellent, Good, Poor, Lost, Unknown]) {
      expect(nextDegradedMode({ mode: 'audio-only', quality, sustainedMs: 600_000 })).toBeNull();
    }
  });

  it('has nothing left to do once already at audio-only', () => {
    expect(
      nextDegradedMode({ mode: 'audio-only', quality: Poor, sustainedMs: 600_000 }),
    ).toBeNull();
  });
});

describe('dwellRequired', () => {
  it('arms no timer when nothing could change', () => {
    expect(dwellRequired('full', Good)).toBeNull();
    expect(dwellRequired('audio-only', Lost)).toBeNull();
    expect(dwellRequired('audio-only', Poor)).toBeNull();
  });

  it('matches the delay the decision actually uses', () => {
    for (const [mode, quality] of [
      ['full', Poor],
      ['low', Poor],
      ['full', Lost],
      ['low', Lost],
    ] as const) {
      const dwell = dwellRequired(mode, quality);
      expect(dwell).not.toBeNull();
      // Waiting exactly this long must be enough to cause the change.
      expect(nextDegradedMode({ mode, quality, sustainedMs: dwell! })).not.toBeNull();
    }
  });
});

describe('isDegraded', () => {
  it('speaks up only for Poor and Lost', () => {
    expect(isDegraded(Poor)).toBe(true);
    expect(isDegraded(Lost)).toBe(true);
    expect(isDegraded(Good)).toBe(false);
    expect(isDegraded(Excellent)).toBe(false);
    expect(isDegraded(Unknown)).toBe(false);
  });
});

describe('mode ordering', () => {
  it('ranks modes from most to least data', () => {
    expect(modeRank('full')).toBeLessThan(modeRank('low'));
    expect(modeRank('low')).toBeLessThan(modeRank('audio-only'));
  });

  it('knows which direction saves data', () => {
    expect(isCheaper('low', 'full')).toBe(true);
    expect(isCheaper('full', 'low')).toBe(false);
    expect(isCheaper('low', 'low')).toBe(false);
  });
});
