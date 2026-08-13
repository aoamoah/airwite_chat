import { redirect } from 'next/navigation';
import { readSession, type SessionAdmin } from './session';

/**
 * Gate for administrator pages. Call it at the top of every protected server
 * component — the check has to happen where the data is read, not in middleware,
 * so there is no route that renders before anyone has been identified.
 */
export async function requireAdmin(): Promise<SessionAdmin> {
  const admin = await readSession();
  if (!admin) redirect('/admin/login');
  return admin;
}

/**
 * Gate for administrator API routes. Returns null when the caller is not an
 * administrator, leaving the route to answer with 401 rather than a redirect.
 */
export async function requireAdminApi(): Promise<SessionAdmin | null> {
  return readSession();
}
