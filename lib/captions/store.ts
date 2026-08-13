import type { Caption } from './types';

/**
 * How long a caption stays on screen after it arrives.
 *
 * Captions are already a second or two behind the speaker, so leaving them up
 * too long puts stale text beside a new sentence. Long enough to read a phrase,
 * short enough not to lie about who is talking.
 */
export const CAPTION_TTL_MS = 6_000;

/** Most speakers shown at once, oldest dropped first. */
export const MAX_VISIBLE = 3;

/**
 * The captions currently worth showing.
 *
 * One line per speaker rather than a running transcript: on a phone, three
 * lines is already most of the screen, and the useful question during a meeting
 * is what someone just said, not what was said a minute ago.
 */
export class CaptionStore {
  private readonly latest = new Map<string, Caption>();

  /** Replaces whatever that speaker last said. */
  set(caption: Caption): void {
    // Re-inserting moves them to the end, so the display order is who spoke
    // most recently rather than who joined first.
    this.latest.delete(caption.identity);
    this.latest.set(caption.identity, caption);
  }

  /** Drops a speaker's caption, e.g. when they leave or switch captions off. */
  clear(identity: string): void {
    this.latest.delete(identity);
  }

  clearAll(): void {
    this.latest.clear();
  }

  /** Captions still within their lifetime, oldest first, newest last. */
  visible(now: number = Date.now()): Caption[] {
    const live: Caption[] = [];
    for (const caption of this.latest.values()) {
      if (now - caption.at < CAPTION_TTL_MS) live.push(caption);
    }
    return live.slice(-MAX_VISIBLE);
  }

  /** Removes anything past its lifetime. Returns true if something went. */
  prune(now: number = Date.now()): boolean {
    let removed = false;
    for (const [identity, caption] of this.latest) {
      if (now - caption.at >= CAPTION_TTL_MS) {
        this.latest.delete(identity);
        removed = true;
      }
    }
    return removed;
  }
}
