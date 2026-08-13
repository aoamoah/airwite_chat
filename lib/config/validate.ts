import { DEFAULT_CONFIG } from './defaults';
import type { AppConfig, ConfigUpdate, DebugConfig, FeatureConfig } from './types';

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Coerces arbitrary parsed JSON into a usable configuration.
 *
 * Every field falls back to its default independently, so a file that is
 * half-edited, partially corrupt, or written by an older version of the app
 * still yields a working config instead of throwing. Unknown keys are dropped
 * rather than preserved: they would otherwise survive a save and accumulate.
 */
export function normalizeConfig(input: unknown): AppConfig {
  const root = objectOrEmpty(input);
  const features = objectOrEmpty(root.features);
  const debug = objectOrEmpty(root.debug);

  const normalizedFeatures = {} as FeatureConfig;
  for (const key of Object.keys(DEFAULT_CONFIG.features) as (keyof FeatureConfig)[]) {
    normalizedFeatures[key] = boolOr(features[key], DEFAULT_CONFIG.features[key]);
  }

  const normalizedDebug = {} as DebugConfig;
  for (const key of Object.keys(DEFAULT_CONFIG.debug) as (keyof DebugConfig)[]) {
    normalizedDebug[key] = boolOr(debug[key], DEFAULT_CONFIG.debug[key]);
  }

  return { features: normalizedFeatures, debug: normalizedDebug };
}

/**
 * Applies a partial update on top of a stored config.
 *
 * Kept separate from the store so the interesting behaviour — that an admin
 * form submitting one section leaves the other alone — is testable without a
 * database.
 */
export function mergeConfig(current: AppConfig, update: ConfigUpdate): AppConfig {
  return normalizeConfig({
    features: { ...current.features, ...update.features },
    debug: { ...current.debug, ...update.debug },
  });
}

/** Parses raw stored text. Unparseable content yields a fresh default config. */
export function parseConfig(text: string): AppConfig {
  try {
    return normalizeConfig(JSON.parse(text));
  } catch {
    return normalizeConfig(undefined);
  }
}
