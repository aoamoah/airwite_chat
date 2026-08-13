/**
 * Feature keys are a stable contract. Once a key ships, both the admin UI and
 * the settings file on disk refer to it by that name, so renaming one silently
 * throws away an administrator's saved choice and reverts to the default. Add
 * keys freely; do not rename or reuse them.
 *
 * Only features that something actually reads belong here. A flag with no
 * consumer produces an admin toggle that appears to do something and doesn't.
 */
export type FeatureKey = 'annotation' | 'airwrite' | 'dataSaver' | 'networkIndicator' | 'captions';

export type FeatureConfig = Record<FeatureKey, boolean>;

export type DebugConfig = {
  /** Master switch: the individual debug flags below do nothing while this is off. */
  enabled: boolean;
  showConnectionStats: boolean;
  showAirWriteDiagnostics: boolean;
};

export type AppConfig = {
  features: FeatureConfig;
  debug: DebugConfig;
};

/** A partial update, as an admin form would submit it. */
export type ConfigUpdate = {
  features?: Partial<FeatureConfig>;
  debug?: Partial<DebugConfig>;
};

/**
 * The only shape that crosses to the browser.
 *
 * Debug settings collapse into a single derived boolean rather than being
 * passed through: the client needs to know *whether* to render the technical
 * readout, not how debugging is structured on the server.
 */
export type PublicConfig = {
  features: FeatureConfig;
  diagnostics: {
    /** Show AirWrite's probability/latency readout instead of a bare toggle. */
    airwrite: boolean;
    /** Mount the connection-statistics panel at all. */
    connectionStats: boolean;
  };
};
