import type * as Ort from 'onnxruntime-web';
import { FEATURE_COUNT } from './features';

/**
 * One trained model, as described by scripts/setup-assets.mjs.
 *
 * The window size is read from the model's own graph at staging time rather
 * than parsed from its filename, so swapping architecture or renaming files
 * cannot leave the app asking for a model that is not there.
 */
export type ModelInfo = {
  file: string;
  windowSize: number;
  featureCount: number;
};

const MANIFEST_URL = '/models/manifest.json';

let manifest: Promise<ModelInfo[]> | null = null;

export function loadModelManifest(): Promise<ModelInfo[]> {
  if (!manifest) {
    manifest = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `no model manifest at ${MANIFEST_URL} (${response.status}) — run pnpm setup:assets`,
          );
        }
        return response.json();
      })
      .then((data: { models?: ModelInfo[] }) => data.models ?? [])
      .catch((cause) => {
        // Don't cache a failure: a later attempt may succeed.
        manifest = null;
        throw cause;
      });
  }
  return manifest;
}

/**
 * onnxruntime-web is imported lazily and never at module scope.
 *
 * Next evaluates client modules on the server while collecting page data, and
 * this package touches browser globals as it initialises — importing it eagerly
 * crashes the build worker. Deferring it also keeps a multi-megabyte runtime out
 * of the chunk every participant downloads, since most never air-write.
 */
let runtime: Promise<typeof Ort> | null = null;

function loadRuntime(): Promise<typeof Ort> {
  if (!runtime) {
    runtime = import('onnxruntime-web').then((ort) => {
      // Served from our own origin by scripts/setup-assets.mjs, so the runtime
      // stays inside the app's CSP and cross-origin isolation rather than
      // reaching for a CDN.
      ort.env.wasm.wasmPaths = '/onnxruntime/';
      // These models are tiny — a couple of recurrent layers over a 64-wide
      // input. Spreading that across a thread pool costs more in coordination
      // than it saves, and every worker competes with the detector and the call
      // itself for cores.
      ort.env.wasm.numThreads = 1;
      return ort;
    });
  }
  return runtime;
}

/**
 * Runs a trained writing/not-writing model over a window of hand features.
 *
 * The graph takes [batch, window, 64] float32 and returns a single sigmoid
 * probability where 1 means writing — the trainer's
 * `(gdf["label"] == "writing")` encoding. Both the LSTM and GRU exports share
 * this contract, so the architecture is immaterial here.
 */
export class WritingClassifier {
  private constructor(
    private readonly ort: typeof Ort,
    private readonly session: Ort.InferenceSession,
    readonly info: ModelInfo,
    private readonly inputName: string,
    private readonly outputName: string,
  ) {}

  get windowSize(): number {
    return this.info.windowSize;
  }

  static async load(info: ModelInfo): Promise<WritingClassifier> {
    // A model trained on a different feature layout would otherwise run happily
    // and return confident nonsense, so refuse it outright.
    if (info.featureCount !== FEATURE_COUNT) {
      throw new Error(
        `${info.file} expects ${info.featureCount} features but the extractor produces ` +
          `${FEATURE_COUNT} — lib/airwriting/features.ts and the trainer have diverged`,
      );
    }
    const ort = await loadRuntime();
    const session = await ort.InferenceSession.create(`/models/${info.file}`, {
      executionProviders: ['wasm'],
    });
    return new WritingClassifier(ort, session, info, session.inputNames[0], session.outputNames[0]);
  }

  /** `input` must be one full window, chronological, of FEATURE_COUNT-wide frames. */
  async predict(input: Float32Array): Promise<number> {
    const expected = this.info.windowSize * FEATURE_COUNT;
    if (input.length !== expected) {
      throw new Error(`expected ${expected} values, got ${input.length}`);
    }
    const tensor = new this.ort.Tensor('float32', input, [1, this.info.windowSize, FEATURE_COUNT]);
    const output = await this.session.run({ [this.inputName]: tensor });
    const data = output[this.outputName].data as Float32Array;
    return data[0];
  }

  async dispose(): Promise<void> {
    await this.session.release();
  }
}
