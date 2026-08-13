import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/admin/db';
import { hashPassword, verifyPassword } from '@/lib/admin/password';
import { createSession, pruneExpiredSessions } from '@/lib/admin/session';
import {
  clearFailures,
  clientKey,
  isThrottled,
  pruneExpiredAttempts,
  recordFailure,
} from '@/lib/admin/throttle';

// Argon2 and the Postgres driver are native modules; neither runs on Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A hash to check against when the username does not exist, so a missing
 * account costs the same time as a wrong password and cannot be told apart.
 */
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('no such administrator');
  return decoyHash;
}

export async function POST(request: Request) {
  let username: unknown;
  let password: unknown;
  try {
    ({ username, password } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  const throttleKey = clientKey(request);
  if (await isThrottled(throttleKey)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  try {
    const admin = await getPrisma().admin.findUnique({ where: { username } });

    // Something is always verified, so a username that does not exist costs the
    // same time as one that does and cannot be distinguished from outside.
    const passwordMatches = await verifyPassword(
      admin?.passwordHash ?? (await getDecoyHash()),
      password,
    );
    const valid = admin !== null && admin.isActive && passwordMatches;

    if (!admin || !valid) {
      await recordFailure(throttleKey);
      // One message for every failure: no hint about which half was wrong.
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    }

    await clearFailures(throttleKey);
    await pruneExpiredAttempts();
    await pruneExpiredSessions();
    await createSession(admin.id);
    await getPrisma().admin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error('[admin] login failed', cause);
    return NextResponse.json(
      { error: 'The administrator database is unavailable.' },
      { status: 503 },
    );
  }
}
