/**
 * How much data a participant is willing to spend.
 *
 * Ordered from most to least expensive. The order is meaningful: automatic
 * degradation only ever moves down this list, never up, so a bad network can
 * never spend more of someone's data than they chose to.
 */
export type DataMode = 'full' | 'low' | 'audio-only';

export const DATA_MODES: readonly DataMode[] = ['full', 'low', 'audio-only'] as const;

/** Lower index means more data. */
export function modeRank(mode: DataMode): number {
  return DATA_MODES.indexOf(mode);
}

/** True when `candidate` spends less data than `current`. */
export function isCheaper(candidate: DataMode, current: DataMode): boolean {
  return modeRank(candidate) > modeRank(current);
}

export const DATA_MODE_LABELS: Record<DataMode, string> = {
  full: 'Normal',
  low: 'Low data',
  'audio-only': 'Audio only',
};

export const DATA_MODE_HINTS: Record<DataMode, string> = {
  full: 'Best picture your connection allows.',
  low: 'Smaller, softer video. Uses much less data.',
  'audio-only': 'No video at all. Uses the least data.',
};
