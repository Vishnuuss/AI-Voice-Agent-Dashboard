import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { purgeBatch, restoreBatch } from '@/lib/trash';

export const maxDuration = 60;

/**
 * Restore one Recycle Bin entry.
 *
 * Reports what could NOT come back as well as what did. A restore is never a
 * guarantee: a lead whose phone number has been re-uploaded on the same business
 * line since the delete cannot be reinserted without violating the
 * (phone, vertical) key, and a call log whose lead was permanently purged has
 * nothing to attach to. Both are reported rather than swallowed, because a
 * client who is told "restored 4,318" and finds 4,300 has lost trust in the
 * whole feature.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const result = await restoreBatch(supabase, id);
    return NextResponse.json({ ...result, success: true });
  } catch (error: any) {
    console.error('[trash:restore] failed', error);
    return NextResponse.json({ error: error?.message || 'Could not restore that entry.' }, { status: 400 });
  }
}

/** Permanently delete one Recycle Bin entry. There is no undo past this point. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    await purgeBatch(supabase, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[trash:purge] failed', error);
    return NextResponse.json({ error: error?.message || 'Could not empty that entry.' }, { status: 400 });
  }
}
