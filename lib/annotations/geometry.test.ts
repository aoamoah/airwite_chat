import { describe, expect, it } from 'vitest';
import { fitFrame, type Rect } from './geometry';

const BOX: Rect = { left: 100, top: 50, width: 400, height: 200 };

describe('fitFrame', () => {
  it('letterboxes a tall frame inside the box under contain', () => {
    // 1:1 video in a 2:1 box: scales to the height, bars left and right.
    const frame = fitFrame(BOX, 1000, 1000, 'contain');
    expect(frame).toEqual({ left: 200, top: 50, width: 200, height: 200 });
  });

  it('overflows the box under cover so no bars are shown', () => {
    // 1:1 video in a 2:1 box: scales to the width and spills top and bottom.
    const frame = fitFrame(BOX, 1000, 1000, 'cover');
    expect(frame).toEqual({ left: 100, top: -50, width: 400, height: 400 });
  });

  it('keeps the frame centred on the box in both fits', () => {
    for (const fit of ['contain', 'cover']) {
      const frame = fitFrame(BOX, 640, 480, fit);
      expect(frame.left + frame.width / 2).toBeCloseTo(BOX.left + BOX.width / 2);
      expect(frame.top + frame.height / 2).toBeCloseTo(BOX.top + BOX.height / 2);
    }
  });

  it('preserves the source aspect ratio', () => {
    for (const fit of ['contain', 'cover']) {
      const frame = fitFrame(BOX, 1920, 1080, fit);
      expect(frame.width / frame.height).toBeCloseTo(1920 / 1080);
    }
  });

  it('never leaves the box unfilled under cover', () => {
    const frame = fitFrame(BOX, 1920, 1080, 'cover');
    expect(frame.width).toBeGreaterThanOrEqual(BOX.width);
    expect(frame.height).toBeGreaterThanOrEqual(BOX.height);
  });

  it('never spills outside the box under contain', () => {
    const frame = fitFrame(BOX, 1920, 1080, 'contain');
    expect(frame.width).toBeLessThanOrEqual(BOX.width);
    expect(frame.height).toBeLessThanOrEqual(BOX.height);
  });

  it('agrees with the box when aspect ratios already match', () => {
    for (const fit of ['contain', 'cover']) {
      expect(fitFrame(BOX, 800, 400, fit)).toEqual(BOX);
    }
  });
});
