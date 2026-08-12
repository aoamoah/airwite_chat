import type { Stroke } from './types';

/**
 * Holds every stroke currently on the board.
 *
 * Deliberately outside React state: points arrive up to ~25x/second per active
 * drawer, and re-rendering the tree that often would be wasted work when the
 * only consumer is a canvas that paints imperatively. Consumers subscribe and
 * repaint instead.
 */
export class AnnotationStore {
  private strokes = new Map<string, Stroke>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Insertion order is paint order, so later strokes cover earlier ones. */
  list(): Stroke[] {
    return Array.from(this.strokes.values());
  }

  get(id: string): Stroke | undefined {
    return this.strokes.get(id);
  }

  begin(stroke: Stroke): void {
    this.strokes.set(stroke.id, stroke);
    this.emit();
  }

  append(id: string, points: number[]): void {
    const stroke = this.strokes.get(id);
    // No stroke means we never saw its 'begin' — drop the points rather than
    // inventing a stroke with no color or author.
    if (!stroke || points.length === 0) return;
    for (const value of points) stroke.points.push(value);
    this.emit();
  }

  remove(id: string): void {
    if (this.strokes.delete(id)) this.emit();
  }

  clear(): void {
    if (this.strokes.size === 0) return;
    this.strokes.clear();
    this.emit();
  }

  /**
   * Folds in a peer's snapshot without dropping anything drawn locally since the
   * request went out, which matters because the snapshot describes the board as
   * it was when the peer answered, not as it is now.
   */
  merge(strokes: Stroke[]): void {
    let changed = false;
    for (const stroke of strokes) {
      if (this.strokes.has(stroke.id)) continue;
      this.strokes.set(stroke.id, { ...stroke, points: [...stroke.points] });
      changed = true;
    }
    if (changed) this.emit();
  }

  /** The given author's most recent stroke — what undo removes. */
  lastStrokeBy(author: string): Stroke | undefined {
    let last: Stroke | undefined;
    for (const stroke of this.strokes.values()) {
      if (stroke.author === author) last = stroke;
    }
    return last;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
