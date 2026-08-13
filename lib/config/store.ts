import { getPrisma } from '@/lib/admin/db';
import { toPublicConfig } from './publicConfig';
import type { AppConfig, ConfigUpdate, PublicConfig } from './types';
import { mergeConfig, normalizeConfig } from './validate';

/**
 * Server-side settings store, backed by a single row in Postgres.
 *
 * Never import this from a client component: it opens a database connection,
 * and what it returns includes private settings. Client code receives
 * `PublicConfig` from a server component instead.
 */

/** The settings document lives in one known row. */
const ROW_ID = 1;

/**
 * Serializes concurrent saves. Two admins toggling different features at the
 * same moment would otherwise both read the same starting document and the
 * second write would silently drop the first one's change.
 */
const WRITE_LOCK_KEY = 8_531_204_771_003n;

/**
 * Settings are read on every room page load but change rarely, so they are
 * cached briefly rather than fetched each time. The window is short enough that
 * an administrator's toggle reaches every server instance within seconds.
 */
const CACHE_TTL_MS = 10_000;

let cached: { value: AppConfig; at: number } | null = null;

/** Reads the current configuration. Never throws: failure means safe defaults. */
export async function readConfig(): Promise<AppConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const row = await getPrisma().appSetting.findUnique({ where: { id: ROW_ID } });
    const value = normalizeConfig(row?.data);
    cached = { value, at: Date.now() };
    return value;
  } catch (cause) {
    console.error('[config] could not read settings', cause);
    // A database outage must not silently reconfigure live meetings, so the
    // last known-good document keeps serving until the database returns.
    if (cached) return cached.value;
    return normalizeConfig(undefined);
  }
}

/** The subset a meeting client is allowed to see. */
export async function readPublicConfig(): Promise<PublicConfig> {
  return toPublicConfig(await readConfig());
}

/** Applies a partial update and persists it. Returns the stored result. */
export async function writeConfig(update: ConfigUpdate): Promise<AppConfig> {
  const merged = await getPrisma().$transaction(async (tx) => {
    // Held until the transaction ends, so the read-modify-write below cannot
    // interleave with another save.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WRITE_LOCK_KEY})`;

    const row = await tx.appSetting.findUnique({ where: { id: ROW_ID } });
    const next = mergeConfig(normalizeConfig(row?.data), update);

    await tx.appSetting.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, data: next },
      update: { data: next },
    });
    return next;
  });

  cached = { value: merged, at: Date.now() };
  return merged;
}
