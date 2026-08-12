import type { Rect } from './geometry';
import type { Stroke } from './types';

/**
 * Repaints the whole board.
 *
 * A full clear-and-redraw each frame is simpler than tracking dirty regions, and
 * it is what makes strokes survive a resize for free: geometry is normalized, so
 * re-running this against a new rect rescales everything. If boards ever grow
 * large enough for this to cost too much, the fix is to cache completed strokes
 * to an offscreen canvas and only redraw in-progress ones.
 */
export function paint(
  canvas: HTMLCanvasElement,
  strokes: readonly Stroke[],
  rect: Rect,
  mirrored = false,
): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  // Assigning to width/height also clears the canvas, so only do it on change.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.scale(dpr, dpr);
  // Strokes are stored against the true video frame. When this viewer sees the
  // feed mirrored, flip the painting to match what is under their pointer.
  if (mirrored) {
    ctx.translate(rect.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const shorterSide = Math.min(rect.width, rect.height);
  for (const stroke of strokes) {
    paintStroke(ctx, stroke, rect, shorterSide);
  }
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  rect: Rect,
  shorterSide: number,
): void {
  const points = stroke.points;
  if (points.length < 2) return;

  const lineWidth = Math.max(1, stroke.width * shorterSide);
  const x = (i: number) => points[i] * rect.width;
  const y = (i: number) => points[i] * rect.height;

  // A tap that never moved still deserves a mark.
  if (points.length === 2) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(x(0), y(1), lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x(0), y(1));

  // Curve through the midpoint of each pair of samples, using the sample itself
  // as the control point. Cheaper than fitting a spline and enough to hide the
  // polygonal look of raw pointer samples.
  for (let i = 2; i + 3 < points.length; i += 2) {
    ctx.quadraticCurveTo(x(i), y(i + 1), (x(i) + x(i + 2)) / 2, (y(i + 1) + y(i + 3)) / 2);
  }
  ctx.lineTo(x(points.length - 2), y(points.length - 1));
  ctx.stroke();
}
