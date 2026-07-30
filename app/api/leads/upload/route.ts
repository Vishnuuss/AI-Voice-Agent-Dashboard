import { NextResponse } from 'next/server';

/**
 * Lead ingestion goes through n8n (not straight to Supabase from here) — n8n's
 * workflow does the real parsing: CSV/XLSX/XLS, fuzzy header detection, 500-row
 * batching for large files, and writes to upload_batches/leads/rejected_leads
 * itself. This route is a thin proxy so the browser only ever talks to our own
 * domain (n8n's webhook URL / any auth in front of it stays server-side).
 */
const FALLBACK_IMPORT_WEBHOOK_URL = 'https://agent.bswealthfinance.com/webhook/lead-uploaded';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data with a file field' }, { status: 400 });
    }

    // Forward the raw multipart body untouched (same bytes, same boundary) instead
    // of re-parsing into FormData and rebuilding it — reconstructing a File/Blob
    // from an already-parsed request body hit Node's "Body has already been read"
    // bug. Passing the raw bytes straight through sidesteps that entirely.
    const bodyBuffer = await request.arrayBuffer();

    const webhookUrl = process.env.N8N_IMPORT_WEBHOOK_URL || FALLBACK_IMPORT_WEBHOOK_URL;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bodyBuffer,
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = { message: await response.text() };
    }

    if (!response.ok) {
      console.error('n8n lead-upload webhook failed', response.status, data);
      return NextResponse.json(
        { error: 'Lead ingestion service rejected the file.', n8nStatus: response.status, data },
        { status: 502 },
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Unexpected error in POST /api/leads/upload:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
