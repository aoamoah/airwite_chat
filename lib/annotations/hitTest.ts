import type { ContentRect } from './useScreenShareRect';
import type { Stroke } from './types';

/**
 * Squared distance from point p to segment ab. Squared throughout to keep the
 * hot loop free of square roots — the caller compares against a squared
 * tolerance.
 */
function distanceToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  // Degenerate segment: fall back to point distance.
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
  const dx = px - (ax + t * abx);
  const dy = py - (ay + t * aby);
  return dx * dx + dy * dy;
}

/**
 * Ids of every stroke the eraser is touching at the given point.
 *
 * The eraser removes whole strokes rather than clearing pixels. That matches the
 * data model — the board is a list of strokes, replicated by id — and means an
 * erase is one small message rather than a rewrite of the affected geometry.
 *
 * Distances are computed in pixels, not normalized units, because the content
 * box is rarely square: a normalized radius would otherwise reach further
 * vertically than horizontally.
 */
export function strokesUnderPoint(
  strokes: readonly Stroke[],
  point: { x: number; y: number },
  eraserRadius: number,
  rect: ContentRect,
): string[] {
  const shorterSide = Math.min(rect.width, rect.height);
  const px = point.x * rect.width;
  const py = point.y * rect.height;
  const eraserPx = eraserRadius * shorterSide;
  const hits: string[] = [];

  for (const stroke of strokes) {
    const points = stroke.points;
    if (points.length < 2) continue;

    // Reach to the edge of the ink, not its centre line.
    const tolerance = eraserPx + Math.max(1, stroke.width * shorterSide) / 2;
    const toleranceSq = tolerance * tolerance;

    if (points.length === 2) {
      const dx = points[0] * rect.width - px;
      const dy = points[1] * rect.height - py;
      if (dx * dx + dy * dy <= toleranceSq) hits.push(stroke.id);
      continue;
    }

    for (let i = 0; i + 3 < points.length; i += 2) {
      const distanceSq = distanceToSegmentSq(
        px,
        py,
        points[i] * rect.width,
        points[i + 1] * rect.height,
        points[i + 2] * rect.width,
        points[i + 3] * rect.height,
      );
      if (distanceSq <= toleranceSq) {
        hits.push(stroke.id);
        break;
      }
    }
  }

  return hits;
}
