/**
 * Languages captions can be produced in.
 *
 * Codes are ISO 639-3, as the transcription API expects. Which engine actually
 * serves each one is decided elsewhere — English may be handled by the browser
 * rather than by an upload.
 */
export type CaptionLanguage = 'twi' | 'eng';

export const CAPTION_LANGUAGE_LABELS: Record<CaptionLanguage, string> = {
  twi: 'Twi',
  eng: 'English',
};

/** One finished utterance, as published to the room. */
export type Caption = {
  /** Participant who spoke it. */
  identity: string;
  /** Display name at the time it was spoken. */
  speaker: string;
  text: string;
  language: CaptionLanguage;
  /** When the utterance ended, by the sender's clock. */
  at: number;
};

/** The wire form, kept short because it crosses the data channel per utterance. */
export type CaptionMessage = {
  t: 'caption';
  /** Text of the utterance. */
  x: string;
  /** Language code. */
  l: CaptionLanguage;
  /** Speaker's display name. */
  n: string;
};

export function toMessage(caption: Caption): CaptionMessage {
  return { t: 'caption', x: caption.text, l: caption.language, n: caption.speaker };
}

/** Parses a data-channel payload, returning null for anything unrecognised. */
export function parseMessage(raw: unknown): CaptionMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Partial<CaptionMessage>;
  if (message.t !== 'caption') return null;
  if (typeof message.x !== 'string' || typeof message.n !== 'string') return null;
  if (message.l !== 'twi' && message.l !== 'eng') return null;
  return { t: 'caption', x: message.x, l: message.l, n: message.n };
}
