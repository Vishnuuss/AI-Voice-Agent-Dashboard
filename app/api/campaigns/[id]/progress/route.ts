import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { dograh } from '@/lib/dograh';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    
    const { data: campaign, error } = await supabase
      .from('campaign_runs')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const progress = await dograh.getCampaignProgress(campaign.dograh_campaign_id);

    return NextResponse.json({ progress });
  } catch (error: any) {
    console.error('Error GET /api/campaigns/[id]/progress:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
