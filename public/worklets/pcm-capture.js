/**
 * Hands raw microphone samples back to the page in useful-sized pieces.
 *
 * The audio thread calls process() every 128 samples, which at 48kHz is once
 * every 2.7ms — posting each one would mean nearly four hundred messages a
 * second for the main thread to unpack. Batching to roughly 20ms cuts that to
 * fifty and matches the granularity voice detection actually needs.
 */
const FRAME_MS = 20;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = Math.round((sampleRate * FRAME_MS) / 1000);
    this.buffer = new Float32Array(this.frameSize);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    // No input yet, or the track ended. Staying alive lets it resume.
    if (!channel) return true;

    let read = 0;
    while (read < channel.length) {
      const room = this.frameSize - this.filled;
      const take = Math.min(room, channel.length - read);
      this.buffer.set(channel.subarray(read, read + take), this.filled);
      this.filled += take;
      read += take;

      if (this.filled === this.frameSize) {
        // Transferred, not copied, so the audio thread does no allocation work
        // beyond the fresh buffer it starts filling next.
        const frame = this.buffer;
        this.port.postMessage(frame, [frame.buffer]);
        this.buffer = new Float32Array(this.frameSize);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
