import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { dograh } from '@/lib/dograh';
import { buildCampaignCsv } from '@/lib/csv-builder';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: campaigns, error } = await supabase
      .from('campaign_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns: campaigns || [] });
  } catch (error: any) {
    console.error('Error GET /api/campaigns:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = createServerClient();
  let queuedLeadIds: string[] = [];

  try {
    const body = await request.json();
    const {
      campaign_name,
      lead_count,
      concurrency = 1,
      target_segment,
      retry_config,
      schedule_config,
    } = body;

    if (!campaign_name || !lead_count) {
      return NextResponse.json(
        { error: 'campaign_name and lead_count are required' },
        { status: 400 }
      );
    }

    // --- Step 1: Pull eligible leads from Supabase ---
    let query = supabase
      .from('leads')
      .select('id, name, phone, city, property_type, budget, email')
      .eq('status', 'new')
      .not('phone', 'is', null);

    if (target_segment) {
      // e.g., filter by city or property_type
      if (target_segment.city) query = query.eq('city', target_segment.city);
      if (target_segment.property_type)
        query = query.eq('property_type', target_segment.property_type);
    }

    query = query.order('created_at', { ascending: true }).limit(lead_count);

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error('Failed to fetch leads:', leadsError);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { error: 'No eligible leads found with status "new"' },
        { status: 400 }
      );
    }

    queuedLeadIds = leads.map((l) => l.id);

    // --- Step 2: Build CSV ---
    const csvString = buildCampaignCsv(leads);
    const csvBuffer = Buffer.from(csvString, 'utf-8');
    const filename = `campaign_${campaign_name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.csv`;

    // --- Step 3: Get presigned S3 upload URL from Dograh ---
    const presigned = await dograh.getPresignedUploadUrl(filename, csvBuffer.length);

    // --- Step 4: Upload CSV to S3 ---
    await dograh.uploadCsvToS3(presigned.upload_url, csvString);

    // --- Step 5: Create campaign in Dograh ---
    const workflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || '8517', 10);
    const dograhCampaign = await dograh.createCampaign({
      name: campaign_name,
      workflow_id: workflowId,
      source_id: presigned.file_key,
      max_concurrency: Math.min(Math.max(concurrency, 1), 100),
      retry_config: retry_config || {
        enabled: true,
        max_retries: 2,
        retry_delay_seconds: 120,
        retry_on_busy: true,
        retry_on_no_answer: true,
        retry_on_voicemail: true,
      },
      schedule_config: schedule_config || undefined,
      circuit_breaker: {
        enabled: true,
        failure_threshold: 0.5,
        window_seconds: 120,
        min_calls_in_window: 5,
      },
    });

    // --- Step 6: Start the campaign ---
    await dograh.startCampaign(dograhCampaign.id);

    // --- Step 7: Save to Supabase campaign_runs ---
    const { data: campaignRun, error: insertError } = await supabase
      .from('campaign_runs')
      .insert({
        campaign_name: campaign_name,
        dograh_campaign_id: dograhCampaign.id,
        workflow_id: workflowId,
        source_id: presigned.file_key,
        requested_count: lead_count,
        actual_count: leads.length,
        concurrency: concurrency,
        status: 'running',
        target_segment: target_segment || null,
        retry_config: retry_config || {},
        schedule_config: schedule_config || {},
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save campaign run:', insertError);
      throw new Error(`Failed to save campaign run: ${insertError.message}`);
    }

    // --- Step 8: Mark leads as queued ---
    const { error: updateError } = await supabase
      .from('leads')
      .update({ status: 'queued', campaign_run_id: campaignRun.id })
      .in('id', queuedLeadIds);

    if (updateError) {
      console.error('Failed to update lead statuses:', updateError);
      // Non-fatal — campaign is already running in Dograh
    }

    return NextResponse.json({
      success: true,
      campaign: campaignRun,
      leads_queued: queuedLeadIds.length,
      dograh_campaign_id: dograhCampaign.id,
    });
  } catch (error: any) {
    console.error('Error POST /api/campaigns:', error);

    // --- Rollback: reset leads back to 'new' if we queued them ---
    if (queuedLeadIds.length > 0) {
      const { error: rollbackError } = await supabase
        .from('leads')
        .update({ status: 'new', campaign_run_id: null })
        .in('id', queuedLeadIds);

      if (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    return NextResponse.json(
      { error: error.message || 'Campaign launch failed' },
      { status: 500 }
    );
  }
}
