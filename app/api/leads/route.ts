import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    const supabase = createServerClient();
    
    let query = supabase.from('leads').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,city.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sort, { ascending: order === 'asc' }).range(from, to);

    const { data: leads, error, count } = await query;

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      leads,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/leads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
