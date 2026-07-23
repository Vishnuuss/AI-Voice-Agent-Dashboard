import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('source');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sourceCount: Record<string, number> = {};
    for (const lead of leads) {
      const src = lead.source || 'unknown';
      sourceCount[src] = (sourceCount[src] || 0) + 1;
    }

    const result = Object.entries(sourceCount)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('Error GET /api/reports/sources:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
