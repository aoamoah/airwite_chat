/**
 * Saturated colors chosen to stay legible over arbitrary shared content —
 * documents, dark IDEs, slides. Deliberately no near-white or near-black.
 */
export const ANNOTATION_PALETTE = [
  '#ff4d4d',
  '#ff8a3d',
  '#ffd43b',
  '#41d97a',
  '#3fb9ff',
  '#8b6dff',
  '#ff5fd0',
] as const;

/**
 * Picks a stable color for a participant so their strokes are attributable
 * without any coordination between clients. Same identity, same color, on every
 * peer — including for participants who joined before you.
 */
export function colorForIdentity(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
  }
  return ANNOTATION_PALETTE[hash % ANNOTATION_PALETTE.length];
}
