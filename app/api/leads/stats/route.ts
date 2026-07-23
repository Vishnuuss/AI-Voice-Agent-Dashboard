import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [totalRes, qualifiedRes, notQualifiedRes, newRes, calledRes, queuedRes, followUpRes] =
      await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('qualification', 'qualified'),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('qualification', 'not_qualified'),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'new'),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'called'),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'queued'),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .not('follow_up_date', 'is', null),
      ]);

    // Get source breakdown
    const { data: allLeads } = await supabase
      .from('leads')
      .select('source');

    const sourceBreakdown: Record<string, number> = {};
    if (allLeads) {
      for (const lead of allLeads) {
        const src = lead.source || 'Unknown';
        sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
      }
    }

    return NextResponse.json({
      total: totalRes.count || 0,
      qualified: qualifiedRes.count || 0,
      not_qualified: notQualifiedRes.count || 0,
      new_leads: newRes.count || 0,
      called: calledRes.count || 0,
      queued: queuedRes.count || 0,
      follow_ups: followUpRes.count || 0,
      not_interested: notQualifiedRes.count || 0,
      site_visits: 0, // No site_visit tracking in current schema
      by_source: sourceBreakdown,
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/leads/stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
