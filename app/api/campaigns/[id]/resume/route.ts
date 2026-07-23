import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { dograh } from '@/lib/dograh';

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

    await dograh.resumeCampaign(campaign.dograh_campaign_id);

    const { data: updated, error: updateError } = await supabase
      .from('campaign_runs')
      .update({ status: 'running', paused_at: null })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: updated });
  } catch (error: any) {
    console.error('Error POST /api/campaigns/[id]/resume:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
