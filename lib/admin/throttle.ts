import { getPrisma } from './db';

/**
 * Slows down password guessing against the admin sign-in.
 *
 * Counted in Postgres rather than in memory: the application runs on serverless
 * instances, and a counter in module memory is per instance, so spreading
 * attempts across instances would sidestep it almost entirely.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 10;

/**
 * Identifies the caller, not the account.
 *
 * Counting failures against the *username* would let anyone lock a real
 * administrator out of their own deployment with a handful of wrong guesses.
 * Keying on where the attempts come from costs an attacker something and costs
 * the administrator nothing.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const address = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim();
  // Without an address every caller shares one bucket, which is worse than
  // useless, so an unidentifiable caller is simply not throttled.
  return address ? `ip:${address}` : '';
}

/** Whether this caller has spent its attempts for now. */
export async function isThrottled(key: string): Promise<boolean> {
  if (!key) return false;
  try {
    const rows = await getPrisma().$queryRaw<{ count: number }[]>`
      SELECT count FROM admin_login_attempts
       WHERE key = ${key} AND expires_at > now()
    `;
    return (rows[0]?.count ?? 0) >= MAX_FAILURES;
  } catch (cause) {
    // A throttle that cannot be read must not become a lockout for everyone.
    console.error('[admin] could not read login attempts', cause);
    return false;
  }
}

/**
 * Counts one failure.
 *
 * Written as a single upsert so that concurrent attempts cannot read the same
 * total and each write it back — the exact race that makes an in-memory counter
 * unreliable in the first place. An expired window is reset inside the same
 * statement rather than by deleting first and inserting after.
 */
export async function recordFailure(key: string): Promise<void> {
  if (!key) return;
  try {
    await getPrisma().$executeRaw`
      INSERT INTO admin_login_attempts ("key", count, expires_at)
      VALUES (${key}, 1, now() + make_interval(secs => ${WINDOW_SECONDS}))
      ON CONFLICT ("key") DO UPDATE SET
        count = CASE
          WHEN admin_login_attempts.expires_at <= now() THEN 1
          ELSE admin_login_attempts.count + 1
        END,
        expires_at = CASE
          WHEN admin_login_attempts.expires_at <= now() THEN EXCLUDED.expires_at
          ELSE admin_login_attempts.expires_at
        END
    `;
  } catch (cause) {
    console.error('[admin] could not record a failed sign-in', cause);
  }
}

/** Forgets a caller's failures. Called once they prove who they are. */
export async function clearFailures(key: string): Promise<void> {
  if (!key) return;
  await getPrisma()
    .adminLoginAttempt.deleteMany({ where: { key } })
    .catch((cause) => console.error('[admin] could not clear login attempts', cause));
}

/** Drops windows that have already elapsed. Called opportunistically on sign-in. */
export async function pruneExpiredAttempts(): Promise<void> {
  await getPrisma()
    .adminLoginAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    .catch((cause) => console.error('[admin] could not prune login attempts', cause));
}
