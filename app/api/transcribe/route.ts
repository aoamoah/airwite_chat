import { NextResponse } from 'next/server';
import { TokenVerifier } from 'livekit-server-sdk';
import { readConfig } from '@/lib/config/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASR_ENDPOINT = 'https://translation-api.ghananlp.org/asr/v3/transcribe';

const SUPPORTED_LANGUAGES = new Set(['twi', 'eng']);

/**
 * Ten seconds of 16kHz mono WAV is about 320KB, and Opus far less. This is
 * generous for one utterance and well under the platform's request limit.
 */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** Content types the upstream API documents. Notably not webm. */
const ALLOWED_CONTENT_TYPES = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg'];

const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Proxies one utterance to the transcription service.
 *
 * It exists to keep the subscription key on the server, and to make sure the
 * caller is someone in a meeting. Every request here costs money, so an open
 * endpoint would be a way to spend the deployment's quota from the outside.
 */
export async function POST(request: Request) {
  const config = await readConfig();
  if (!config.features.captions) {
    return NextResponse.json({ error: 'Captions are not enabled.' }, { status: 403 });
  }

  const apiKey = process.env.KHAYA_API_KEY;
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!apiKey || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('[captions] KHAYA_API_KEY or LiveKit credentials are not configured');
    return NextResponse.json({ error: 'Captions are unavailable.' }, { status: 503 });
  }

  // The caller proves they are in a meeting with the same token they used to
  // join it, verified against our own signing secret.
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'Not in a meeting.' }, { status: 401 });
  }
  try {
    const grants = await new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).verify(token);
    if (!grants.video?.room) {
      return NextResponse.json({ error: 'Not in a meeting.' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Not in a meeting.' }, { status: 401 });
  }

  const language = new URL(request.url).searchParams.get('language') ?? '';
  if (!SUPPORTED_LANGUAGES.has(language)) {
    return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Unsupported audio format.' }, { status: 415 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: 'No audio received.' }, { status: 400 });
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That clip is too long.' }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${ASR_ENDPOINT}?language=${encodeURIComponent(language)}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': contentType,
      },
      body: audio,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      // Upstream messages can name the service and its internals, so they are
      // logged rather than forwarded.
      console.error('[captions] transcription failed', upstream.status, await upstream.text());
      return NextResponse.json(
        { error: 'Could not transcribe that.' },
        { status: upstream.status === 429 ? 429 : 502 },
      );
    }

    const result = (await upstream.json()) as { text?: unknown };
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    // Silence and noise both come back empty; that is a normal outcome.
    return NextResponse.json({ text });
  } catch (cause) {
    console.error('[captions] transcription request failed', cause);
    return NextResponse.json({ error: 'Could not transcribe that.' }, { status: 502 });
  }
}
