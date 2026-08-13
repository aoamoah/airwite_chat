/**
 * Stages the binary assets air-writing needs into public/, where the browser can
 * fetch them.
 *
 * They are generated rather than committed: the MediaPipe wasm is ~34MB and
 * already sits in node_modules, and the hand landmarker is a stable public
 * artifact. Only the trained model in models/ is version-controlled, and it is
 * copied rather than moved so that folder stays the source of truth.
 *
 * Self-hosted rather than CDN-loaded so the app keeps working offline and under
 * the app's cross-origin isolation headers.
 */
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readInputSignature } from './onnx-signature.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WASM_SOURCE = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const WASM_TARGET = join(root, 'public/mediapipe/wasm');
const HAND_LANDMARKER = join(root, 'public/mediapipe/hand_landmarker.task');
const HAND_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ONNX_SOURCE = join(root, 'models');
const ONNX_TARGET = join(root, 'public/models');
const ORT_SOURCE = join(root, 'node_modules/onnxruntime-web/dist');
const ORT_TARGET = join(root, 'public/onnxruntime');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SOURCE))) {
    console.warn('[assets] @mediapipe/tasks-vision not installed, skipping wasm');
    return;
  }
  await mkdir(WASM_TARGET, { recursive: true });
  const files = await readdir(WASM_SOURCE);
  let copied = 0;
  for (const file of files) {
    const target = join(WASM_TARGET, file);
    const source = join(WASM_SOURCE, file);
    // Skip files already staged at the same size; this runs on every install.
    if (await exists(target)) {
      const [a, b] = await Promise.all([stat(source), stat(target)]);
      if (a.size === b.size) continue;
    }
    await copyFile(source, target);
    copied++;
  }
  console.log(`[assets] mediapipe wasm: ${copied} file(s) refreshed`);
}

/**
 * onnxruntime-web fetches its wasm at runtime from whatever `env.wasm.wasmPaths`
 * points at. Serving it from our own origin keeps it under the app's CSP and
 * cross-origin isolation headers.
 */
async function copyOrtRuntime() {
  if (!(await exists(ORT_SOURCE))) {
    console.warn('[assets] onnxruntime-web not installed, skipping runtime');
    return;
  }
  await mkdir(ORT_TARGET, { recursive: true });
  const files = (await readdir(ORT_SOURCE)).filter((file) => file.startsWith('ort-wasm'));
  let copied = 0;
  for (const file of files) {
    const target = join(ORT_TARGET, file);
    const source = join(ORT_SOURCE, file);
    if (await exists(target)) {
      const [a, b] = await Promise.all([stat(source), stat(target)]);
      if (a.size === b.size) continue;
    }
    await copyFile(source, target);
    copied++;
  }
  console.log(`[assets] onnxruntime wasm: ${copied} file(s) refreshed`);
}

async function fetchHandLandmarker() {
  if (await exists(HAND_LANDMARKER)) {
    console.log('[assets] hand_landmarker.task already present');
    return;
  }
  await mkdir(dirname(HAND_LANDMARKER), { recursive: true });
  console.log('[assets] downloading hand_landmarker.task (~7.8MB)');
  const response = await fetch(HAND_LANDMARKER_URL);
  if (!response.ok || !response.body) {
    throw new Error(`hand_landmarker download failed: ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(HAND_LANDMARKER));
  console.log('[assets] hand_landmarker.task ready');
}

/**
 * Stages the trained models and writes a manifest describing them.
 *
 * Each model's window size is read from its own graph rather than parsed out of
 * the filename, so renaming files or changing architecture cannot leave the app
 * requesting a model that is not there. The app reads the manifest and offers
 * exactly what shipped.
 *
 * The target directory is emptied first: a stale model left behind from a
 * previous architecture would otherwise still be served and selectable.
 */
async function copyTrainedModels() {
  if (!(await exists(ONNX_SOURCE))) return;
  const files = (await readdir(ONNX_SOURCE)).filter((file) => file.endsWith('.onnx'));
  if (files.length === 0) {
    console.warn('[assets] no .onnx models found in models/');
    return;
  }

  await rm(ONNX_TARGET, { recursive: true, force: true });
  await mkdir(ONNX_TARGET, { recursive: true });

  const entries = [];
  for (const file of files) {
    const source = join(ONNX_SOURCE, file);
    const signature = readInputSignature(await readFile(source));
    if (!signature) {
      console.warn(`[assets] ${file}: not a readable ONNX model, skipping`);
      continue;
    }
    // [batch, window, features] — the batch axis is symbolic.
    const [, windowSize, featureCount] = signature.shape;
    if (typeof windowSize !== 'number' || typeof featureCount !== 'number') {
      console.warn(`[assets] ${file}: unexpected input shape ${JSON.stringify(signature.shape)}`);
      continue;
    }
    await copyFile(source, join(ONNX_TARGET, file));
    entries.push({ file, windowSize, featureCount });
  }

  entries.sort((a, b) => a.windowSize - b.windowSize);
  await writeFile(join(ONNX_TARGET, 'manifest.json'), `${JSON.stringify({ models: entries }, null, 2)}\n`);
  console.log(
    `[assets] trained models staged: ${entries
      .map((entry) => `${entry.file} (window ${entry.windowSize}, ${entry.featureCount} features)`)
      .join(', ')}`,
  );
}

await copyWasm();
await copyOrtRuntime();
await fetchHandLandmarker();
await copyTrainedModels();
