import { describe, expect, it } from 'vitest';
import { strokesUnderPoint } from './hitTest';
import type { Stroke } from './types';
import type { Rect } from './geometry';

/** Deliberately non-square: catches radius maths done in normalized units. */
const RECT: Rect = { left: 0, top: 0, width: 1000, height: 500 };
const RADIUS = 0.02; // 0.02 * 500 = 10px of reach

function stroke(id: string, points: number[], width = 0.006): Stroke {
  return { id, author: 'alice', surface: 'screen:alice', color: '#ff0000', width, points };
}

describe('strokesUnderPoint', () => {
  it('hits a stroke the eraser is sitting on', () => {
    const strokes = [stroke('a', [0.2, 0.5, 0.8, 0.5])];
    expect(strokesUnderPoint(strokes, { x: 0.5, y: 0.5 }, RADIUS, RECT)).toEqual(['a']);
  });

  it('misses a stroke well outside the eraser', () => {
    const strokes = [stroke('a', [0.2, 0.5, 0.8, 0.5])];
    expect(strokesUnderPoint(strokes, { x: 0.5, y: 0.9 }, RADIUS, RECT)).toEqual([]);
  });

  it('reaches equally far horizontally and vertically on a non-square board', () => {
    // 12px above and 12px right of a dot at the centre. In pixels both are out
    // of a 10px + half-ink reach; in normalized units the vertical one would
    // wrongly register, since the box is twice as wide as it is tall.
    const strokes = [stroke('dot', [0.5, 0.5])];
    const above = { x: 0.5, y: 0.5 - 12 / RECT.height };
    const right = { x: 0.5 + 12 / RECT.width, y: 0.5 };
    expect(strokesUnderPoint(strokes, above, RADIUS, RECT)).toEqual([]);
    expect(strokesUnderPoint(strokes, right, RADIUS, RECT)).toEqual([]);
  });

  it('reaches to the edge of thick ink, not just its centre line', () => {
    // 14px below the line: beyond the 10px eraser alone, within it once half of
    // a 0.02 * 500 = 10px-wide stroke is added.
    const thick = [stroke('thick', [0.2, 0.5, 0.8, 0.5], 0.02)];
    const thin = [stroke('thin', [0.2, 0.5, 0.8, 0.5], 0.001)];
    const point = { x: 0.5, y: 0.5 + 14 / RECT.height };
    expect(strokesUnderPoint(thick, point, RADIUS, RECT)).toEqual(['thick']);
    expect(strokesUnderPoint(thin, point, RADIUS, RECT)).toEqual([]);
  });

  it('measures distance to the segment, not to its endpoints', () => {
    // Directly over the middle of a long horizontal line: far from both ends.
    const strokes = [stroke('a', [0, 0.5, 1, 0.5])];
    expect(strokesUnderPoint(strokes, { x: 0.5, y: 0.5 }, RADIUS, RECT)).toEqual(['a']);
  });

  it('does not run past the end of a segment', () => {
    // Beyond the right end of a line that stops at x=0.5.
    const strokes = [stroke('a', [0.1, 0.5, 0.5, 0.5])];
    expect(strokesUnderPoint(strokes, { x: 0.9, y: 0.5 }, RADIUS, RECT)).toEqual([]);
  });

  it('reports each hit stroke once, however many segments match', () => {
    const zigzag = [stroke('a', [0.4, 0.5, 0.5, 0.5, 0.6, 0.5, 0.7, 0.5])];
    expect(strokesUnderPoint(zigzag, { x: 0.5, y: 0.5 }, RADIUS, RECT)).toEqual(['a']);
  });

  it('returns every stroke under the eraser', () => {
    const strokes = [
      stroke('a', [0.2, 0.5, 0.8, 0.5]),
      stroke('b', [0.5, 0.2, 0.5, 0.8]),
      stroke('c', [0.1, 0.1, 0.2, 0.1]),
    ];
    expect(strokesUnderPoint(strokes, { x: 0.5, y: 0.5 }, RADIUS, RECT)).toEqual(['a', 'b']);
  });

  it('hits a single-point dot', () => {
    const strokes = [stroke('dot', [0.5, 0.5])];
    expect(strokesUnderPoint(strokes, { x: 0.5, y: 0.5 }, RADIUS, RECT)).toEqual(['dot']);
  });
});
