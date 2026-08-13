import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
