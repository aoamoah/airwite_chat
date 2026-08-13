import type { AppConfig } from './types';

/**
 * What the application runs on when no settings file exists, or when the one on
 * disk is unreadable. These values must be safe to serve to strangers: a fresh
 * deploy with no administrator involvement should hold an ordinary meeting.
 */
export const DEFAULT_CONFIG: Readonly<AppConfig> = Object.freeze({
  features: Object.freeze({
    annotation: true,
    // Off until an administrator opts in. AirWrite is experimental and depends
    // on GPU behaviour that varies by browser, so nothing about a normal
    // meeting may depend on it.
    airwrite: false,
    // On by default: the whole point of the product is holding up on a weak
    // connection, and both of these cost nothing when the network is fine.
    dataSaver: true,
    networkIndicator: true,
  }),
  debug: Object.freeze({
    enabled: false,
    showConnectionStats: false,
    showAirWriteDiagnostics: false,
  }),
}) as Readonly<AppConfig>;
