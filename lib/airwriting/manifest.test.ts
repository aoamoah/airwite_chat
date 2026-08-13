import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInputSignature } from '../../scripts/onnx-signature.mjs';
import { FEATURE_COUNT } from './features';

const MODELS_DIR = join(process.cwd(), 'models');

describe('readInputSignature', () => {
  it('returns null for something that is not an ONNX model', () => {
    expect(readInputSignature(Buffer.from('not a model at all'))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(readInputSignature(Buffer.alloc(0))).toBeNull();
  });
});

/**
 * Guards the contract between the trainer's exports and the runtime. Models are
 * swapped as training progresses, and a change to the feature count is exactly
 * the kind of thing that would otherwise surface as a confidently wrong
 * classifier rather than an error.
 */
describe('staged models', () => {
  const files = existsSync(MODELS_DIR)
    ? readdirSync(MODELS_DIR).filter((file) => file.endsWith('.onnx'))
    : [];

  it.skipIf(files.length === 0)('every model matches the extractor feature count', () => {
    for (const file of files) {
      const signature = readInputSignature(readFileSync(join(MODELS_DIR, file)));
      expect(signature, `${file} should be readable`).not.toBeNull();

      const [batch, windowSize, featureCount] = signature!.shape;
      // Batch is symbolic, so it reads back as null rather than a number.
      expect(batch, `${file} batch axis`).toBeNull();
      expect(windowSize, `${file} window`).toBeGreaterThan(0);
      expect(featureCount, `${file} feature count`).toBe(FEATURE_COUNT);
    }
  });
});
