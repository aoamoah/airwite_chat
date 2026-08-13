/**
 * Turns captured audio into something the transcription API accepts.
 *
 * The API documents mp3, wav, flac, and ogg. Opus is worth reaching for at
 * roughly an eighth the size, so a recording is attempted first — including
 * WebM, which is undocumented but wraps the same codec. WAV is built here as
 * the fallback: a header and raw samples, so it needs no encoder and no
 * dependency, and it is known to work.
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

/**
 * Opus containers worth recording into, best first.
 *
 * Firefox offers Ogg; Chrome and Safari only offer WebM. Both wrap the same
 * Opus stream, and the service was observed to inspect the audio itself rather
 * than trust the declared type — so WebM is worth attempting even though the
 * API documents only Ogg. If it turns out to be rejected, the caller still
 * holds the WAV it captured in parallel.
 */
const PREFERRED_RECORDING_TYPES = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus'];

/** The best Opus container this browser can record, or null if it cannot. */
export function preferredRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of PREFERRED_RECORDING_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * What to call a recording when uploading it.
 *
 * Ogg is the only Opus container the API lists, so WebM is declared as Ogg.
 * That is a claim about the codec rather than the container, and the service
 * decodes by inspection — but it is a guess, which is why the WAV fallback
 * exists.
 */
export function uploadContentType(recordingType: string): string {
  return recordingType.startsWith('audio/wav') ? 'audio/wav' : 'audio/ogg';
}
