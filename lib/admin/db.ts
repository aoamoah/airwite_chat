import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

/**
 * Database access for administrator features. Server-only.
 *
 * The client is created on first use rather than at import time, so a missing
 * or broken DATABASE_URL takes down admin functionality alone — a meeting has
 * no reason to fail because nobody configured the admin database.
 */

declare global {
  // Survives the module reloading that `next dev` does on every edit, which
  // would otherwise open a new connection pool per save until Postgres refuses.
  // eslint-disable-next-line no-var
  var __yehyiaPrisma: PrismaClient | undefined;
}

function requiresTls(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return true;
  }
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — administrator features need a database');
  }
  const adapter = new PrismaPg({
    connectionString,
    // The managed host's certificate chains to a public CA, so this both
    // encrypts and verifies. Do not relax it to `rejectUnauthorized: false`:
    // an unverified connection leaves the password exchange open to an active
    // network attacker, which is the one thing this table must survive.
    ssl: requiresTls(connectionString) ? { rejectUnauthorized: true } : undefined,
  });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalThis.__yehyiaPrisma) {
    globalThis.__yehyiaPrisma = createClient();
  }
  return globalThis.__yehyiaPrisma;
}
