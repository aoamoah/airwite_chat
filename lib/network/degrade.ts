import { ConnectionQuality } from 'livekit-client';
import { isCheaper, type DataMode } from './types';

/**
 * How long a bad reading must persist before anything changes.
 *
 * Connection quality flickers — a single Poor sample during a keyframe burst is
 * normal and self-corrects. Acting on it would mean a meeting whose video
 * quality visibly thrashes, which reads as broken even when the network is fine.
 */
export const POOR_DWELL_MS = 8_000;

/** Already down to low video and still struggling: give up on video. */
export const SUSTAINED_POOR_DWELL_MS = 30_000;

/** Lost is not a flicker, so it needs far less confirmation than Poor. */
export const LOST_DWELL_MS = 5_000;

export type DegradeInput = {
  /** The mode currently in effect. */
  mode: DataMode;
  quality: ConnectionQuality;
  /** How long `quality` has held this value. */
  sustainedMs: number;
};

/**
 * Decides whether to spend less data, given how the connection has been
 * behaving. Returns the mode to move to, or null to stay put.
 *
 * Pure, so the thresholds above can be tested without a network.
 */
export function nextDegradedMode({ mode, quality, sustainedMs }: DegradeInput): DataMode | null {
  const target = targetFor(mode, quality, sustainedMs);
  if (target === null) return null;
  // Only ever step down. Recovering is the participant's call: silently
  // restoring video could spend money they did not agree to spend.
  return isCheaper(target, mode) ? target : null;
}

function targetFor(
  mode: DataMode,
  quality: ConnectionQuality,
  sustainedMs: number,
): DataMode | null {
  if (quality === ConnectionQuality.Lost) {
    return sustainedMs >= LOST_DWELL_MS ? 'audio-only' : null;
  }

  if (quality === ConnectionQuality.Poor) {
    if (mode === 'full') return sustainedMs >= POOR_DWELL_MS ? 'low' : null;
    // Still poor after dropping to low video: video is not affordable here.
    if (mode === 'low') return sustainedMs >= SUSTAINED_POOR_DWELL_MS ? 'audio-only' : null;
  }

  return null;
}

/**
 * How long this combination must hold before it would change anything, or null
 * if it never would.
 *
 * Lets the watcher arm a single timer per reading instead of polling: any
 * change to quality or mode resets the timer, which is exactly what "sustained"
 * means.
 */
export function dwellRequired(mode: DataMode, quality: ConnectionQuality): number | null {
  if (quality === ConnectionQuality.Lost) {
    return mode === 'audio-only' ? null : LOST_DWELL_MS;
  }
  if (quality === ConnectionQuality.Poor) {
    if (mode === 'full') return POOR_DWELL_MS;
    if (mode === 'low') return SUSTAINED_POOR_DWELL_MS;
  }
  return null;
}

/** Whether the connection is bad enough to tell the participant about. */
export function isDegraded(quality: ConnectionQuality): boolean {
  return quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;
}
