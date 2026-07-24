import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { dograh } from '@/lib/dograh';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const supabase = createServerClient();
    
    const { data: campaign, error } = await supabase
      .from('campaign_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const runs = await dograh.getCampaignRuns(campaign.dograh_campaign_id, page, limit);

    return NextResponse.json(runs);
  } catch (error: any) {
    console.error('Error GET /api/campaigns/[id]/runs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
