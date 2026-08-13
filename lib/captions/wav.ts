/**
 * Turns captured audio into something the transcription API accepts.
 *
 * The API takes mp3, wav, flac, or ogg — notably not webm, which is what
 * Chrome's MediaRecorder produces by default. Where the browser can record
 * Ogg/Opus we use that, because it is roughly eight times smaller. Where it
 * cannot, we build a WAV here: it is a header and raw samples, so it needs no
 * encoder and no dependency.
 */

/** What speech recognition wants. Sending more is paying to upload detail no model uses. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Reduces a signal to the target rate by averaging each source window.
 *
 * Averaging rather than picking every Nth sample: dropping samples aliases
 * high frequencies down into the speech band as a metallic whine, which is
 * exactly the range the model is listening to.
 */
export function downsample(
  samples: Float32Array,
  fromRate: number,
  toRate: number = TARGET_SAMPLE_RATE,
): Float32Array {
  if (toRate > fromRate) {
    throw new Error(`cannot upsample ${fromRate}Hz to ${toRate}Hz`);
  }
  if (toRate === fromRate) return samples;

  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Writes mono 16-bit PCM in a RIFF/WAVE container. */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const byteRate = sampleRate * 2; // mono, two bytes per sample
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // format: uncompressed PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a sample above 1 would otherwise wrap to a loud
    // click at the opposite polarity.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Ogg/Opus recording types worth trying, cheapest first. */
const PREFERRED_RECORDING_TYPES = ['audio/ogg;codecs=opus', 'audio/ogg'];

/**
 * The best container this browser can record that the API will also accept, or
 * null when there is none and WAV has to be built by hand.
 */
export function preferredRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of PREFERRED_RECORDING_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  // Deliberately no webm fallback: Chrome offers it and the API rejects it.
  return null;
}
