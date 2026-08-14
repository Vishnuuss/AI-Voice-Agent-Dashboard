import { NextResponse } from 'next/server';
import { createServerClient, isMissingTableError } from '@/lib/supabase-server';
import { purgeAll, RETENTION_DAYS } from '@/lib/trash';

/**
 * The Recycle Bin listing.
 *
 * Lists delete ACTIONS, not deleted rows. "4,318 unqualified leads, deleted 2
 * hours ago" is one line the client can restore in one click; 4,318 lines would
 * be the same unusable volume the delete feature exists to reduce.
 */

const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10) || 25, 1), MAX_LIMIT);

    const supabase = createServerClient();

    let query = supabase.from('trash_batches').select('*', { count: 'exact' });
    if (entity && ['lead', 'call_log', 'campaign'].includes(entity)) {
      query = query.eq('entity', entity);
    }

    const from = (page - 1) * limit;
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      // The bin is the one screen a client opens when they are already worried
      // about lost data, so say plainly when it is not there yet rather than
      // showing an empty bin, which would read as "your data is gone".
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: 'The Recycle Bin tables are missing. Run scripts/008_trash_and_feedback.sql in Supabase.', batches: [] },
          { status: 503 },
        );
      }
      console.error('[trash:GET] query failed', error);
      return NextResponse.json({ error: 'Failed to load the Recycle Bin.' }, { status: 500 });
    }

    const total = count || 0;
    return NextResponse.json({
      batches: data ?? [],
      retentionDays: RETENTION_DAYS,
      totalCount: total,
      totalPages: total ? Math.ceil(total / limit) : 0,
    });
  } catch (error: any) {
    console.error('[trash:GET] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Empty the bin — permanent, for everything currently in it.
 *
 * Requires `?confirm=empty` so that a stray DELETE to the collection URL cannot
 * destroy the one copy of data the client deleted by mistake.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('confirm') !== 'empty') {
      return NextResponse.json({ error: 'Add ?confirm=empty to permanently empty the Recycle Bin.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const purged = await purgeAll(supabase);
    return NextResponse.json({ purged, success: true });
  } catch (error: any) {
    console.error('[trash:DELETE] unexpected', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
