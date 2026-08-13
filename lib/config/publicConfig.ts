import { DEFAULT_CONFIG } from './defaults';
import type { AppConfig, PublicConfig } from './types';

/**
 * Narrows the stored configuration to what a meeting participant may know.
 *
 * Anything not named here stays on the server — debug internals now, and
 * infrastructure or model settings later. This is the single crossing point,
 * so a new private field is private by default rather than by remembering.
 */
export function toPublicConfig(config: AppConfig): PublicConfig {
  // The master debug switch gates each specific flag, so turning debugging off
  // hides every readout without having to clear the flags underneath it.
  const debugging = config.debug.enabled;

  return {
    features: { ...config.features },
    diagnostics: {
      airwrite: debugging && config.debug.showAirWriteDiagnostics,
      connectionStats: debugging && config.debug.showConnectionStats,
    },
  };
}

/** Used when no server value reached the client, e.g. outside a provider. */
export const DEFAULT_PUBLIC_CONFIG: PublicConfig = toPublicConfig(DEFAULT_CONFIG);
