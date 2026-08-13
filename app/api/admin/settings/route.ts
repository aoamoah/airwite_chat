import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/auth';
import { readConfig, writeConfig } from '@/lib/config/store';
import type { ConfigUpdate } from '@/lib/config/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  return NextResponse.json(await readConfig());
}

export async function PUT(request: Request) {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let update: ConfigUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  try {
    // Unknown keys and non-boolean values are stripped on the way in, so the
    // stored document is always a config this application can read.
    return NextResponse.json(await writeConfig(update ?? {}));
  } catch (cause) {
    console.error('[admin] could not save settings', cause);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 503 });
  }
}
