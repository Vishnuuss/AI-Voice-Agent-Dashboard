import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const [activeRes, targetedRes, calledRes, qualifiedRes] = await Promise.all([
      supabase.from('campaign_runs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
      supabase.from('campaign_runs').select('requested_count'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'called'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('qualification', 'qualified')
    ]);

    const activeCount = activeRes.count || 0;
    const totalTargeted = (targetedRes.data || []).reduce((sum, c) => sum + (c.requested_count || 0), 0);
    const totalCalled = calledRes.count || 0;
    const totalQualified = qualifiedRes.count || 0;

    return NextResponse.json({
      activeCampaigns: activeCount,
      totalTargeted,
      totalCalled,
      totalQualified
    });
  } catch (error: any) {
    console.error('Error GET /api/campaigns/stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
