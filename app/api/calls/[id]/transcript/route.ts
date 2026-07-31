import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Returns the transcript for one call log.
 *
 * The browser cannot fetch Dograh's transcript URL directly (no CORS headers on
 * the storage bucket), which is why the lead panel could only ever offer a link
 * that opened in a new tab. This proxies it server-side.
 *
 * SSRF-safe by construction: the URL is never taken from the request. It is read
 * from the call_logs row identified by :id, so a caller can only ever reach a URL
 * we previously stored ourselves.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;

/** Normalises the many transcript shapes into [{ speaker, text }]. */
function toMessages(payload: unknown): { speaker: string; text: string }[] | null {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.messages)
      ? (payload as any).messages
      : Array.isArray((payload as any)?.transcript)
        ? (payload as any).transcript
        : Array.isArray((payload as any)?.turns)
          ? (payload as any).turns
          : null;

  if (!rows) return null;

  return rows
    .map((row: any) => {
      if (typeof row === 'string') return { speaker: 'Agent', text: row };
      const rawSpeaker = String(row?.speaker ?? row?.role ?? row?.source ?? 'agent').toLowerCase();
      const text = row?.text ?? row?.content ?? row?.message ?? row?.transcript ?? '';
      if (!text) return null;
      const speaker =
        rawSpeaker.includes('user') || rawSpeaker.includes('customer') || rawSpeaker.includes('human')
          ? 'Customer'
          : 'Agent';
      return { speaker, text: String(text) };
    })
    .filter(Boolean) as { speaker: string; text: string }[];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data: call, error } = await supabase
      .from('call_logs')
      .select('id, transcript_url, gathered_context')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[calls/transcript] lookup failed', error);
      return NextResponse.json({ error: 'Failed to load the call.' }, { status: 500 });
    }
    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    if (!call.transcript_url) {
      return NextResponse.json({ messages: null, text: null, reason: 'no_transcript' });
    }

    let url: URL;
    try {
      url = new URL(call.transcript_url);
    } catch {
      return NextResponse.json({ error: 'Stored transcript URL is not valid.' }, { status: 422 });
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return NextResponse.json({ error: 'Unsupported transcript URL scheme.' }, { status: 422 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'The transcript could not be downloaded.', providerStatus: res.status },
          { status: 502 },
        );
      }

      const body = (await res.text()).slice(0, MAX_BYTES);

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        // Plain-text transcript; fall through and return it as-is.
      }

      return NextResponse.json({
        messages: parsed ? toMessages(parsed) : null,
        text: parsed ? null : body,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Timed out downloading the transcript.' }, { status: 504 });
    }
    console.error('[calls/transcript] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
