import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * Feature layout expected by the trained models, ported from the trainer's
 * `src/data/preprocess.py` and `src/data/loaders.py`.
 *
 *   feature_columns = ["hand_detected"] + [f"l{i}_{axis}" for i in range(21)
 *                                          for axis in ("x", "y", "z")]
 *
 * so index 0 is the detection flag and the remaining 63 are landmark-major
 * (l0_x, l0_y, l0_z, l1_x, ...). Any drift between this and the training
 * pipeline produces confident nonsense rather than an error, so the two must be
 * changed together.
 */
export const LANDMARK_COUNT = 21;
export const FEATURE_COUNT = 1 + LANDMARK_COUNT * 3;

/** Landmark index of the index fingertip, which drives the pen position. */
export const INDEX_FINGERTIP = 8;

/**
 * Which hand the models were trained on. The collector defaulted to the right
 * hand and required an exact handedness match, dropping frames that only
 * contained the other hand.
 */
export const TARGET_HANDEDNESS = 'Right';

/**
 * Picks the tracked hand from a detection result, mirroring the collector's
 * `select_hand`.
 *
 * Handedness is used as reported. The collector verified against unmirrored
 * frames that MediaPipe labels the physical right hand "Right", and the frames
 * fed in here are equally unmirrored — the local preview's mirror is applied in
 * CSS, downstream of the pixels.
 */
export function selectHand(
  landmarks: NormalizedLandmark[][] | undefined,
  handedness: Category[][] | undefined,
  target: string = TARGET_HANDEDNESS,
): NormalizedLandmark[] | null {
  if (!landmarks || landmarks.length === 0) return null;

  let best: NormalizedLandmark[] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < landmarks.length; i++) {
    const category = handedness?.[i]?.[0];
    if (!category || category.categoryName !== target) continue;
    if (category.score > bestScore) {
      bestScore = category.score;
      best = landmarks[i];
    }
  }
  return best;
}

/**
 * Builds one frame of model input.
 *
 * Landmarks are translated so the wrist is the origin and then divided by the
 * hand span — the greatest distance of any landmark from the wrist — which
 * removes where the hand is on screen and how big it appears. A frame with no
 * hand is all zeros with the flag cleared, which is what the trainer fed the
 * model too: `drop_undetected: false`, because "no hand visible" is itself
 * evidence of not writing.
 *
 * Writes into `out` when given, so the per-frame path allocates nothing.
 */
export function extractFeatures(
  landmarks: NormalizedLandmark[] | null,
  out: Float32Array = new Float32Array(FEATURE_COUNT),
): Float32Array {
  out.fill(0);
  if (!landmarks || landmarks.length < LANDMARK_COUNT) return out;

  out[0] = 1;

  const wrist = landmarks[0];
  // Translate to the wrist, keeping the result to hand while the span is found.
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const base = 1 + i * 3;
    out[base] = landmarks[i].x - wrist.x;
    out[base + 1] = landmarks[i].y - wrist.y;
    out[base + 2] = landmarks[i].z - wrist.z;
  }

  let span = 0;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const base = 1 + i * 3;
    const distance = Math.hypot(out[base], out[base + 1], out[base + 2]);
    if (distance > span) span = distance;
  }
  // A degenerate hand would divide by zero; the trainer substitutes 1.0.
  if (span === 0) span = 1;

  for (let i = 0; i < LANDMARK_COUNT * 3; i++) {
    out[1 + i] /= span;
  }
  return out;
}
