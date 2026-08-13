'use client';

import * as React from 'react';
import { DEFAULT_PUBLIC_CONFIG } from './publicConfig';
import type { PublicConfig } from './types';

const FeatureContext = React.createContext<PublicConfig>(DEFAULT_PUBLIC_CONFIG);

/**
 * Carries the server's public feature configuration down to client components.
 *
 * The value comes from a server component, so it is already narrowed — nothing
 * private travels through here.
 */
export function FeatureProvider({
  config,
  children,
}: {
  config: PublicConfig;
  children: React.ReactNode;
}) {
  return <FeatureContext.Provider value={config}>{children}</FeatureContext.Provider>;
}

/**
 * Reads the feature configuration. Falls back to defaults outside a provider,
 * so a component rendered in isolation behaves like a fresh install rather
 * than crashing.
 */
export function useFeatures(): PublicConfig {
  return React.useContext(FeatureContext);
}
