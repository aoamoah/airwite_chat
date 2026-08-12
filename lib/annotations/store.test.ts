import { describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from './store';
import type { Stroke } from './types';

function stroke(
  id: string,
  author = 'alice',
  points: number[] = [0, 0],
  surface = 'screen:alice',
): Stroke {
  return { id, author, surface, color: '#ff0000', width: 0.006, points: [...points] };
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

  it('keeps boards independent', () => {
    const store = new AnnotationStore();
    store.begin(stroke('screen1', 'alice', [0, 0], 'screen:alice'));
    store.begin(stroke('face1', 'alice', [0, 0], 'camera:bob'));
    store.begin(stroke('face2', 'bob', [0, 0], 'camera:bob'));

    expect(store.list('camera:bob').map((s) => s.id)).toEqual(['face1', 'face2']);
    expect(store.list('screen:alice').map((s) => s.id)).toEqual(['screen1']);
    expect(store.list()).toHaveLength(3);
  });

  it('clearing one board leaves the others alone', () => {
    const store = new AnnotationStore();
    store.begin(stroke('screen1', 'alice', [0, 0], 'screen:alice'));
    store.begin(stroke('face1', 'alice', [0, 0], 'camera:bob'));

    store.clear('camera:bob');
    expect(store.list().map((s) => s.id)).toEqual(['screen1']);
  });

  it('clearing an untouched board changes nothing and notifies nobody', () => {
    const store = new AnnotationStore();
    store.begin(stroke('screen1', 'alice', [0, 0], 'screen:alice'));
    const listener = vi.fn();
    store.subscribe(listener);

    store.clear('camera:nobody');
    expect(listener).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(1);
  });

  it('undo reaches across boards to the author most recent stroke', () => {
    const store = new AnnotationStore();
    store.begin(stroke('a1', 'alice', [0, 0], 'screen:alice'));
    store.begin(stroke('a2', 'alice', [0, 0], 'camera:bob'));
    expect(store.lastStrokeBy('alice')?.id).toBe('a2');
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
