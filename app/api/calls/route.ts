import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');
    const outcome = searchParams.get('outcome');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const supabase = createServerClient();
    
    // Using a joined query to get lead name and phone
    let query = supabase
      .from('call_logs')
      .select('*, leads (name, phone)', { count: 'exact' });

    if (direction && direction !== 'all') {
      query = query.eq('direction', direction);
    }
    
    if (outcome) {
      query = query.eq('outcome', outcome);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data: calls, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      calls,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error: any) {
    console.error('Error GET /api/calls:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
