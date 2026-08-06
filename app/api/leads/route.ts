import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/** Columns a client is allowed to sort by - anything else is a PostgREST error. */
const SORTABLE = new Set([
  'created_at',
  'updated_at',
  'last_attempt_at',
  'follow_up_date',
  'score',
  'name',
  'status',
]);

const MAX_LIMIT = 200;

/**
 * PostgREST's `.or()` takes a filter expression as a STRING, so commas, parentheses
 * and dots in user input change its meaning. Strip them rather than trusting the
 * search box.
 */
function sanitiseSearch(raw: string): string {
  return raw.replace(/[,()*%\\"']/g, ' ').trim().slice(0, 80);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const qualification = searchParams.get('qualification') || '';
    const followUp = searchParams.get('followUp');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), MAX_LIMIT);
    const requestedSort = searchParams.get('sort') || 'created_at';
    const sort = SORTABLE.has(requestedSort) ? requestedSort : 'created_at';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    const supabase = createServerClient();

    let query = supabase.from('leads').select('*', { count: 'exact' });

    const term = sanitiseSearch(search);
    if (term) {
      query = query.or(
        `name.ilike.%${term}%,phone.ilike.%${term}%,city.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }

    // `status` accepts a comma-separated list so the UI can ask for
    // "retry_pending,no_answer" in one call.
    if (status) {
      const values = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (values.length === 1) query = query.eq('status', values[0]);
      else if (values.length > 1) query = query.in('status', values);
    }

    if (qualification) query = query.eq('qualification', qualification);

    // How the LAST call ended, which is a different question from what state the
    // lead is in. A busy number is status `retry_pending` with call_outcome
    // `busy`, so filtering on status alone could never produce a list of busy or
    // voicemail numbers.
    const outcome = searchParams.get('outcome') || '';
    if (outcome) {
      const values = outcome.split(',').map((s) => s.trim()).filter(Boolean);
      if (values.length === 1) query = query.eq('call_outcome', values[0]);
      else if (values.length > 1) query = query.in('call_outcome', values);
    }

    // Drives the Follow-ups page, which previously rendered a hard-coded empty list.
    if (followUp === 'true') query = query.not('follow_up_date', 'is', null);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order(sort, { ascending: order === 'asc', nullsFirst: false })
      .range(from, to);

    const { data: leads, error, count } = await query;

    if (error) {
      console.error('[leads:GET] query failed', error);
      return NextResponse.json({ error: 'Failed to load leads.' }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = total ? Math.ceil(total / limit) : 0;

    return NextResponse.json({
      leads: leads ?? [],
      // The dashboard hooks read these flat keys; `pagination` is kept for any
      // other consumer that already depends on it.
      totalCount: total,
      totalPages,
      pagination: { total, page, limit, totalPages },
    });
  } catch (error: any) {
    console.error('[leads:GET] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
