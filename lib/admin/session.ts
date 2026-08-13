import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getPrisma } from './db';

/** Name of the cookie holding the opaque session token. */
export const SESSION_COOKIE = 'yehyia_admin_session';

/**
 * How long a login lasts. Short enough that an unattended browser stops being a
 * way in, long enough to configure a deployment without re-authenticating.
 */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionAdmin = {
  id: string;
  username: string;
  role: string;
};

/**
 * The cookie carries the token; the database stores only this digest. The token
 * is 256 random bits, so a plain hash is enough — there is no weak password
 * here to grind, and nothing derived from the digest can be replayed.
 */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issues a session for an administrator and sets the cookie. */
export async function createSession(adminId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPrisma().adminSession.create({
    data: { id: digest(token), adminId, expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Plain HTTP in local development would otherwise never receive the cookie.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Resolves the current administrator, or null. Never throws: if the database is
 * unreachable the caller is simply treated as logged out.
 */
export async function readSession(): Promise<SessionAdmin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await getPrisma().adminSession.findUnique({
      where: { id: digest(token) },
      include: { admin: true },
    });

    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await getPrisma().adminSession.delete({ where: { id: session.id } });
      return null;
    }
    // A deactivated account loses access immediately, without waiting for the
    // session it already holds to expire.
    if (!session.admin.isActive) return null;

    return {
      id: session.admin.id,
      username: session.admin.username,
      role: session.admin.role,
    };
  } catch (cause) {
    console.error('[admin] session lookup failed', cause);
    return null;
  }
}

/** Ends the current session, both in the database and in the browser. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    // Already gone is a fine outcome, so a missing row is not an error.
    await getPrisma()
      .adminSession.deleteMany({ where: { id: digest(token) } })
      .catch((cause) => console.error('[admin] could not delete session', cause));
  }
  jar.delete(SESSION_COOKIE);
}

/** Clears sessions that have already expired. Called opportunistically on login. */
export async function pruneExpiredSessions(): Promise<void> {
  await getPrisma()
    .adminSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    .catch((cause) => console.error('[admin] could not prune sessions', cause));
}
