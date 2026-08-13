import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTER, UtteranceSegmenter, frameLevel, type SegmentEvent } from './segmenter';

const LOUD = 0.2;
const QUIET = 0;
/** One frame every 20ms, which is what a 320-sample frame at 16kHz works out to. */
const FRAME_MS = 20;

/** Feeds frames and returns every event produced. */
function feed(
  segmenter: UtteranceSegmenter,
  frames: { level: number; count: number }[],
): SegmentEvent[] {
  const events: SegmentEvent[] = [];
  let at = 0;
  for (const { level, count } of frames) {
    for (let i = 0; i < count; i++) {
      events.push(segmenter.push(level, at));
      at += FRAME_MS;
    }
  }
  return events;
}

const framesFor = (ms: number) => Math.ceil(ms / FRAME_MS);

describe('UtteranceSegmenter', () => {
  it('stays idle in silence', () => {
    const events = feed(new UtteranceSegmenter(), [{ level: QUIET, count: 50 }]);
    expect(events.every((event) => event.type === 'idle')).toBe(true);
  });

  it('starts on the first loud frame', () => {
    const events = feed(new UtteranceSegmenter(), [{ level: LOUD, count: 3 }]);
    expect(events[0].type).toBe('start');
    expect(events[1].type).toBe('speaking');
  });

  it('ends after a held pause', () => {
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: framesFor(1000) },
      { level: QUIET, count: framesFor(DEFAULT_SEGMENTER.hangoverMs + 100) },
    ]);
    const end = events.find((event) => event.type === 'end');
    expect(end).toBeDefined();
    expect(end && end.type === 'end' && end.reason).toBe('pause');
  });

  it('rides through a short gap between words', () => {
    // A breath is not the end of a sentence.
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: framesFor(600) },
      { level: QUIET, count: framesFor(200) },
      { level: LOUD, count: framesFor(600) },
    ]);
    expect(events.some((event) => event.type === 'end')).toBe(false);
  });

  it('excludes the trailing pause from the utterance', () => {
    const speechMs = 1000;
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: framesFor(speechMs) },
      { level: QUIET, count: framesFor(DEFAULT_SEGMENTER.hangoverMs + 200) },
    ]);
    const end = events.find((event) => event.type === 'end');
    if (!end || end.type !== 'end') throw new Error('expected an end event');
    // Ends where the sound stopped, not where the pause was confirmed.
    expect(end.endedAt - end.startedAt).toBeLessThan(speechMs + FRAME_MS * 2);
  });

  it('discards a click too short to be speech', () => {
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: 2 },
      { level: QUIET, count: framesFor(DEFAULT_SEGMENTER.hangoverMs + 100) },
    ]);
    expect(events.some((event) => event.type === 'discard')).toBe(true);
    expect(events.some((event) => event.type === 'end')).toBe(false);
  });

  it('cuts someone who never pauses', () => {
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: framesFor(DEFAULT_SEGMENTER.maxUtteranceMs + 500) },
    ]);
    const end = events.find((event) => event.type === 'end');
    expect(end && end.type === 'end' && end.reason).toBe('maxLength');
  });

  it('can run a second utterance after the first', () => {
    const events = feed(new UtteranceSegmenter(), [
      { level: LOUD, count: framesFor(800) },
      { level: QUIET, count: framesFor(DEFAULT_SEGMENTER.hangoverMs + 100) },
      { level: LOUD, count: framesFor(800) },
      { level: QUIET, count: framesFor(DEFAULT_SEGMENTER.hangoverMs + 100) },
    ]);
    expect(events.filter((event) => event.type === 'end')).toHaveLength(2);
  });

  it('forgets an utterance in progress when reset', () => {
    const segmenter = new UtteranceSegmenter();
    feed(segmenter, [{ level: LOUD, count: 10 }]);
    expect(segmenter.isSpeaking).toBe(true);
    segmenter.reset();
    expect(segmenter.isSpeaking).toBe(false);
  });

  it('respects a raised threshold', () => {
    const segmenter = new UtteranceSegmenter({ speechThreshold: 0.5 });
    expect(feed(segmenter, [{ level: 0.3, count: 10 }]).every((e) => e.type === 'idle')).toBe(true);
  });
});

describe('frameLevel', () => {
  it('is zero for silence', () => {
    expect(frameLevel(new Float32Array(128))).toBe(0);
  });

  it('is zero for an empty frame', () => {
    expect(frameLevel(new Float32Array(0))).toBe(0);
  });

  it('is the amplitude of a constant signal', () => {
    expect(frameLevel(new Float32Array(64).fill(0.5))).toBeCloseTo(0.5, 6);
  });

  it('ignores polarity', () => {
    const alternating = Float32Array.from({ length: 64 }, (_, i) => (i % 2 ? 0.4 : -0.4));
    expect(frameLevel(alternating)).toBeCloseTo(0.4, 6);
  });
});
