import { describe, expect, it } from 'vitest';
import { TARGET_SAMPLE_RATE, downsample, encodeWav } from './wav';
import { parseMessage, toMessage, type Caption } from './types';

describe('downsample', () => {
  it('leaves a signal already at the target rate alone', () => {
    const samples = Float32Array.from([0.1, 0.2, 0.3]);
    expect(downsample(samples, TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE)).toBe(samples);
  });

  it('reduces length by the rate ratio', () => {
    const samples = new Float32Array(48_000);
    expect(downsample(samples, 48_000, 16_000)).toHaveLength(16_000);
  });

  it('averages rather than dropping samples', () => {
    // Picking every third sample would give 0; averaging keeps the energy.
    const samples = Float32Array.from([0, 0.3, 0.6, 0, 0.3, 0.6]);
    const out = downsample(samples, 48_000, 16_000);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0.3, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
  });

  it('preserves a constant level', () => {
    const out = downsample(new Float32Array(4800).fill(0.5), 48_000, 16_000);
    expect(out.every((value) => Math.abs(value - 0.5) < 1e-6)).toBe(true);
  });

  it('refuses to upsample', () => {
    expect(() => downsample(new Float32Array(10), 8_000, 16_000)).toThrow(/upsample/);
  });
});

describe('encodeWav', () => {
  async function header(blob: Blob) {
    return new DataView(await blob.arrayBuffer());
  }

  it('writes a RIFF/WAVE header', async () => {
    const view = await header(encodeWav(new Float32Array(10)));
    const tag = (offset: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(36)).toBe('data');
  });

  it('declares mono 16-bit PCM at the given rate', async () => {
    const view = await header(encodeWav(new Float32Array(10), 16_000));
    expect(view.getUint16(20, true)).toBe(1); // uncompressed PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('sizes the payload at two bytes per sample', async () => {
    const blob = encodeWav(new Float32Array(100));
    expect(blob.size).toBe(44 + 200);
    const view = await header(blob);
    expect(view.getUint32(40, true)).toBe(200);
  });

  it('clamps rather than wrapping a sample past full scale', async () => {
    // Without clamping this wraps to a loud click at the opposite polarity.
    const view = await header(encodeWav(Float32Array.from([2, -2])));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('announces itself as WAV', () => {
    expect(encodeWav(new Float32Array(4)).type).toBe('audio/wav');
  });
});

describe('caption messages', () => {
  const caption: Caption = {
    identity: 'abc',
    speaker: 'Ama',
    text: 'Yɛfrɛ me Ama',
    language: 'twi',
    at: 1,
  };

  it('survives a round trip', () => {
    expect(parseMessage(toMessage(caption))).toEqual({
      t: 'caption',
      x: 'Yɛfrɛ me Ama',
      l: 'twi',
      n: 'Ama',
    });
  });

  it('does not carry the sender identity, which the transport already proves', () => {
    expect(toMessage(caption)).not.toHaveProperty('identity');
  });

  it('rejects anything that is not a caption', () => {
    for (const input of [null, undefined, 42, 'caption', {}, { t: 'stroke' }]) {
      expect(parseMessage(input)).toBeNull();
    }
  });

  it('rejects a caption in a language we do not offer', () => {
    expect(parseMessage({ t: 'caption', x: 'hello', l: 'fra', n: 'Ama' })).toBeNull();
  });

  it('rejects malformed fields', () => {
    expect(parseMessage({ t: 'caption', x: 5, l: 'twi', n: 'Ama' })).toBeNull();
    expect(parseMessage({ t: 'caption', x: 'hi', l: 'twi' })).toBeNull();
  });
});
