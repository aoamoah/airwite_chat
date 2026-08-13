import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/admin/db';
import { hashPassword, verifyPassword } from '@/lib/admin/password';
import { createSession, pruneExpiredSessions } from '@/lib/admin/session';

// Argon2 and the Postgres driver are native modules; neither runs on Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

/**
 * Throttles password guessing. This lives in process memory, so it is a speed
 * bump per instance rather than a guarantee — worth having, not worth trusting
 * as the only defence. Move it into Postgres if the app is ever run multi-instance.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
  }
}

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

  const throttleKey = username.toLowerCase();
  if (tooManyAttempts(throttleKey)) {
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
      recordFailure(throttleKey);
      // One message for every failure: no hint about which half was wrong.
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    }

    attempts.delete(throttleKey);
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
