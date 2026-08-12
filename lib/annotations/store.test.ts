import { describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from './store';
import type { Stroke } from './types';

function stroke(id: string, author = 'alice', points: number[] = [0, 0]): Stroke {
  return { id, author, color: '#ff0000', width: 0.006, points: [...points] };
}

describe('AnnotationStore', () => {
  it('appends points to an existing stroke', () => {
    const store = new AnnotationStore();
    store.begin(stroke('a'));
    store.append('a', [0.5, 0.5]);
    expect(store.get('a')?.points).toEqual([0, 0, 0.5, 0.5]);
  });

  it('drops points for a stroke whose begin was never seen', () => {
    const store = new AnnotationStore();
    store.append('missing', [0.5, 0.5]);
    expect(store.get('missing')).toBeUndefined();
  });

  it('notifies subscribers only when state actually changes', () => {
    const store = new AnnotationStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.clear(); // already empty
    expect(listener).not.toHaveBeenCalled();

    store.begin(stroke('a'));
    expect(listener).toHaveBeenCalledTimes(1);

    store.remove('nope'); // not present
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps locally drawn strokes when merging a peer snapshot', () => {
    const store = new AnnotationStore();
    store.begin(stroke('local'));
    store.merge([stroke('remote', 'bob')]);
    expect(store.list().map((s) => s.id)).toEqual(['local', 'remote']);
  });

  it('does not let a merge overwrite a stroke already in progress', () => {
    const store = new AnnotationStore();
    store.begin(stroke('a'));
    store.append('a', [1, 1]);
    store.merge([stroke('a')]); // stale snapshot of the same stroke
    expect(store.get('a')?.points).toEqual([0, 0, 1, 1]);
  });

  it('copies merged points so the snapshot cannot be mutated through the store', () => {
    const store = new AnnotationStore();
    const incoming = stroke('a');
    store.merge([incoming]);
    store.append('a', [0.2, 0.2]);
    expect(incoming.points).toEqual([0, 0]);
  });

  it('undo targets the author own most recent stroke', () => {
    const store = new AnnotationStore();
    store.begin(stroke('a1', 'alice'));
    store.begin(stroke('b1', 'bob'));
    store.begin(stroke('a2', 'alice'));
    expect(store.lastStrokeBy('alice')?.id).toBe('a2');
    expect(store.lastStrokeBy('bob')?.id).toBe('b1');
    expect(store.lastStrokeBy('carol')).toBeUndefined();
  });

  it('preserves paint order across removals', () => {
    const store = new AnnotationStore();
    store.begin(stroke('a'));
    store.begin(stroke('b'));
    store.begin(stroke('c'));
    store.remove('b');
    expect(store.list().map((s) => s.id)).toEqual(['a', 'c']);
  });
});
