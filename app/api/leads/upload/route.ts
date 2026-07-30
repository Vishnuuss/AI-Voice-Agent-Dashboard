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
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const webhookUrl = process.env.N8N_IMPORT_WEBHOOK_URL || FALLBACK_IMPORT_WEBHOOK_URL;

    // Re-wrap as a fresh Blob: the File from request.formData() is backed by a
    // single-use stream, so handing it straight to a new FormData/fetch fails
    // with "Body has already been read" once undici tries to read it again.
    const fileBuffer = await file.arrayBuffer();
    const forward = new FormData();
    forward.set('file', new Blob([fileBuffer], { type: file.type }), file.name);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: forward,
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
