import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './defaults';
import { toPublicConfig } from './publicConfig';
import { mergeConfig, normalizeConfig, parseConfig } from './validate';

describe('normalizeConfig', () => {
  it('returns defaults for nothing at all', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults for a non-object', () => {
    for (const input of [null, 42, 'settings', [], true]) {
      expect(normalizeConfig(input)).toEqual(DEFAULT_CONFIG);
    }
  });

  it('keeps valid values', () => {
    const config = normalizeConfig({ features: { annotation: false, airwrite: true } });
    expect(config.features).toMatchObject({ annotation: false, airwrite: true });
  });

  it('supplies defaults for keys the stored document does not mention', () => {
    const config = normalizeConfig({ features: { annotation: false } });
    // Every known key is always present, whatever was on record.
    expect(Object.keys(config.features).sort()).toEqual(
      Object.keys(DEFAULT_CONFIG.features).sort(),
    );
  });

  it('falls back per field, so one bad value does not lose the others', () => {
    const config = normalizeConfig({ features: { annotation: 'yes', airwrite: true } });
    expect(config.features.annotation).toBe(DEFAULT_CONFIG.features.annotation);
    expect(config.features.airwrite).toBe(true);
  });

  it('drops unknown keys rather than letting them accumulate', () => {
    const config = normalizeConfig({
      features: { annotation: true, telepathy: true },
      somethingElse: 1,
    });
    expect(config.features).not.toHaveProperty('telepathy');
    expect(config).not.toHaveProperty('somethingElse');
  });

  it('fills in a section that is missing entirely', () => {
    expect(normalizeConfig({ features: { airwrite: true } }).debug).toEqual(DEFAULT_CONFIG.debug);
  });

  it('does not hand back the shared defaults object', () => {
    const config = normalizeConfig(undefined);
    config.features.annotation = false;
    expect(DEFAULT_CONFIG.features.annotation).toBe(true);
  });
});

describe('parseConfig', () => {
  it('reads well-formed JSON', () => {
    expect(parseConfig('{"features":{"airwrite":true}}').features.airwrite).toBe(true);
  });

  it('falls back to defaults on a truncated file', () => {
    expect(parseConfig('{"features":{"airwrite":tr')).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to defaults on an empty file', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });
});

describe('mergeConfig', () => {
  const stored = normalizeConfig({
    features: { annotation: true, airwrite: true },
    debug: { enabled: true, showConnectionStats: true, showAirWriteDiagnostics: true },
  });

  it('leaves untouched sections alone', () => {
    expect(mergeConfig(stored, { features: { airwrite: false } }).debug).toEqual(stored.debug);
  });

  it('leaves untouched keys within a section alone', () => {
    const next = mergeConfig(stored, { features: { airwrite: false } });
    expect(next.features).toEqual({ ...stored.features, airwrite: false });
  });

  it('is a no-op for an empty update', () => {
    expect(mergeConfig(stored, {})).toEqual(stored);
  });

  it('rejects a bad value rather than storing it', () => {
    const next = mergeConfig(stored, { features: { airwrite: 'off' as unknown as boolean } });
    expect(next.features.airwrite).toBe(DEFAULT_CONFIG.features.airwrite);
  });

  it('does not mutate the config it was given', () => {
    mergeConfig(stored, { features: { airwrite: false } });
    expect(stored.features.airwrite).toBe(true);
  });
});

describe('toPublicConfig', () => {
  it('does not leak debug settings', () => {
    const publicConfig = toPublicConfig({
      features: { ...DEFAULT_CONFIG.features, annotation: true, airwrite: true },
      debug: { enabled: true, showConnectionStats: true, showAirWriteDiagnostics: false },
    });
    expect(publicConfig).not.toHaveProperty('debug');
    expect(Object.keys(publicConfig).sort()).toEqual(['diagnostics', 'features']);
  });

  it('shows a readout only when both the master switch and its flag are on', () => {
    const diagnostics = (enabled: boolean, flags: boolean) =>
      toPublicConfig({
        features: DEFAULT_CONFIG.features,
        debug: { enabled, showConnectionStats: flags, showAirWriteDiagnostics: flags },
      }).diagnostics;

    expect(diagnostics(true, true)).toEqual({ airwrite: true, connectionStats: true });
    expect(diagnostics(false, true)).toEqual({ airwrite: false, connectionStats: false });
    expect(diagnostics(true, false)).toEqual({ airwrite: false, connectionStats: false });
  });

  it('keeps the two readouts independent', () => {
    expect(
      toPublicConfig({
        features: DEFAULT_CONFIG.features,
        debug: { enabled: true, showConnectionStats: true, showAirWriteDiagnostics: false },
      }).diagnostics,
    ).toEqual({ airwrite: false, connectionStats: true });
  });

  it('copies features rather than aliasing them', () => {
    const config = normalizeConfig(undefined);
    const publicConfig = toPublicConfig(config);
    publicConfig.features.airwrite = true;
    expect(config.features.airwrite).toBe(false);
  });
});
