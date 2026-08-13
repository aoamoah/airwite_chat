import { describe, expect, it } from 'vitest';
import { CAPTION_TTL_MS, CaptionStore, MAX_VISIBLE } from './store';
import type { Caption } from './types';

function caption(identity: string, text: string, at: number): Caption {
  return { identity, speaker: identity, text, language: 'twi', at };
}

describe('CaptionStore', () => {
  it('starts empty', () => {
    expect(new CaptionStore().visible(0)).toEqual([]);
  });

  it('keeps only the latest line per speaker', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'first', 0));
    store.set(caption('ama', 'second', 100));

    const visible = store.visible(100);
    expect(visible).toHaveLength(1);
    expect(visible[0].text).toBe('second');
  });

  it('orders by who spoke most recently', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'a', 0));
    store.set(caption('kofi', 'b', 10));
    // Ama speaks again, so she should no longer be the older line.
    store.set(caption('ama', 'c', 20));

    expect(store.visible(20).map((entry) => entry.identity)).toEqual(['kofi', 'ama']);
  });

  it('hides a caption once its time is up', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'hello', 0));

    expect(store.visible(CAPTION_TTL_MS - 1)).toHaveLength(1);
    expect(store.visible(CAPTION_TTL_MS)).toHaveLength(0);
  });

  it('shows no more than the maximum, keeping the newest', () => {
    const store = new CaptionStore();
    for (let i = 0; i < MAX_VISIBLE + 2; i++) {
      store.set(caption(`speaker-${i}`, `line ${i}`, i));
    }

    const visible = store.visible(MAX_VISIBLE + 2);
    expect(visible).toHaveLength(MAX_VISIBLE);
    // The two earliest speakers are the ones dropped.
    expect(visible[0].identity).toBe('speaker-2');
  });

  it('forgets one speaker without touching the others', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'a', 0));
    store.set(caption('kofi', 'b', 0));

    store.clear('ama');
    expect(store.visible(0).map((entry) => entry.identity)).toEqual(['kofi']);
  });

  it('clears everything', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'a', 0));
    store.clearAll();
    expect(store.visible(0)).toEqual([]);
  });

  it('reports whether pruning changed anything', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'a', 0));

    expect(store.prune(0)).toBe(false);
    expect(store.prune(CAPTION_TTL_MS)).toBe(true);
    // Nothing left, so a second pass has nothing to report.
    expect(store.prune(CAPTION_TTL_MS)).toBe(false);
  });

  it('drops expired entries rather than merely hiding them', () => {
    const store = new CaptionStore();
    store.set(caption('ama', 'a', 0));
    store.prune(CAPTION_TTL_MS);
    // Time travelling backwards must not resurrect it.
    expect(store.visible(0)).toEqual([]);
  });
});
