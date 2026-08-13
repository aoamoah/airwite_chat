import type { CaptionLanguage } from './types';
import { uploadContentType } from './wav';

/**
 * Sends one utterance to be transcribed.
 *
 * Goes through this application's own route rather than the transcription
 * service directly: the subscription key stays on the server, and the request
 * is checked against the caller's meeting token before it costs anything.
 */
export async function transcribe(
  audio: Blob,
  language: CaptionLanguage,
  participantToken: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`/api/transcribe?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: {
      // A recorder reports its own container, which is not always one the
      // service names. This maps it to the closest type the API documents.
      'Content-Type': uploadContentType(audio.type || 'audio/wav'),
      Authorization: `Bearer ${participantToken}`,
    },
    body: audio,
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new TranscriptionError(body.error ?? 'Could not transcribe that.', response.status);
  }

  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }

  /** Whether retrying the same clip could plausibly work. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}
