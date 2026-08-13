import { describe, expect, it } from 'vitest';
import { extractFeatures, selectHand, FEATURE_COUNT, LANDMARK_COUNT } from './features';
import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

function hand(points: [number, number, number][]): NormalizedLandmark[] {
  return points.map(([x, y, z]) => ({ x, y, z, visibility: 1 }) as NormalizedLandmark);
}

/** A hand whose landmarks fan out from the wrist along x. */
function syntheticHand(offset = 0): NormalizedLandmark[] {
  return hand(
    Array.from({ length: LANDMARK_COUNT }, (_, i) => [0.5 + offset + i * 0.01, 0.4, 0.001 * i]),
  );
}

function category(name: string, score: number): Category[] {
  return [{ categoryName: name, score, index: 0, displayName: name }];
}

describe('extractFeatures', () => {
  it('emits a cleared vector when no hand was detected', () => {
    const features = extractFeatures(null);
    expect(features).toHaveLength(FEATURE_COUNT);
    expect(Array.from(features).every((value) => value === 0)).toBe(true);
  });

  it('treats a short landmark list as no hand rather than reading past the end', () => {
    const features = extractFeatures(hand([[0.5, 0.5, 0]]));
    expect(features[0]).toBe(0);
  });

  it('sets the detection flag first, matching the trainer column order', () => {
    expect(extractFeatures(syntheticHand())[0]).toBe(1);
  });

  it('moves the wrist to the origin', () => {
    const features = extractFeatures(syntheticHand());
    expect(features[1]).toBe(0);
    expect(features[2]).toBe(0);
    expect(features[3]).toBe(0);
  });

  it('scales so the furthest landmark sits exactly one unit from the wrist', () => {
    const features = extractFeatures(syntheticHand());
    let span = 0;
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const base = 1 + i * 3;
      span = Math.max(span, Math.hypot(features[base], features[base + 1], features[base + 2]));
    }
    expect(span).toBeCloseTo(1, 6);
  });

  it('is invariant to where the hand sits on screen', () => {
    const centre = Array.from(extractFeatures(syntheticHand(0)));
    const shifted = Array.from(extractFeatures(syntheticHand(0.25)));
    centre.forEach((value, i) => expect(shifted[i]).toBeCloseTo(value, 6));
  });

  it('is invariant to apparent hand size', () => {
    const near = extractFeatures(
      hand(Array.from({ length: LANDMARK_COUNT }, (_, i) => [0.2 + i * 0.02, 0.5, 0])),
    );
    const far = extractFeatures(
      hand(Array.from({ length: LANDMARK_COUNT }, (_, i) => [0.2 + i * 0.01, 0.5, 0])),
    );
    Array.from(near).forEach((value, i) => expect(far[i]).toBeCloseTo(value, 6));
  });

  it('keeps landmark-major ordering', () => {
    const points = Array.from(
      { length: LANDMARK_COUNT },
      (_, i) => [0.5, 0.5, 0] as [number, number, number],
    );
    points[0] = [0.5, 0.5, 0];
    points[3] = [0.5, 0.9, 0]; // only landmark 3 moves, and only in y
    const features = extractFeatures(hand(points));
    expect(features[1 + 3 * 3]).toBeCloseTo(0, 6); // l3_x
    expect(features[1 + 3 * 3 + 1]).toBeCloseTo(1, 6); // l3_y carries the offset
  });

  it('survives a degenerate hand instead of dividing by zero', () => {
    const collapsed = hand(
      Array.from({ length: LANDMARK_COUNT }, () => [0.5, 0.5, 0] as [number, number, number]),
    );
    const features = extractFeatures(collapsed);
    expect(features[0]).toBe(1);
    expect(Array.from(features).some(Number.isNaN)).toBe(false);
  });

  it('reuses the caller buffer without leaving stale values behind', () => {
    const buffer = new Float32Array(FEATURE_COUNT).fill(9);
    extractFeatures(null, buffer);
    expect(Array.from(buffer).every((value) => value === 0)).toBe(true);
  });
});

describe('selectHand', () => {
  it('returns null when nothing was detected', () => {
    expect(selectHand([], [])).toBeNull();
    expect(selectHand(undefined, undefined)).toBeNull();
  });

  it('ignores the non-target hand entirely', () => {
    const left = syntheticHand();
    expect(selectHand([left], [category('Left', 0.99)])).toBeNull();
  });

  it('picks the target hand when both are present', () => {
    const left = syntheticHand(0);
    const right = syntheticHand(0.1);
    const picked = selectHand([left, right], [category('Left', 0.9), category('Right', 0.8)]);
    expect(picked).toBe(right);
  });

  it('prefers the highest-scoring match when the target appears twice', () => {
    const weak = syntheticHand(0);
    const strong = syntheticHand(0.1);
    const picked = selectHand([weak, strong], [category('Right', 0.6), category('Right', 0.95)]);
    expect(picked).toBe(strong);
  });
});
