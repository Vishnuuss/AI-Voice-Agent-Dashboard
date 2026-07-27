import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DograhApiError, DograhClient, DograhConfigError, dograh } from '@/lib/dograh';
import { buildCampaignCsv } from '@/lib/csv-builder';
import { isTerminal, mapDograhStatus } from '@/lib/campaign-state';

/** Statuses that mean "a launch for this name is already in flight". */
const IN_FLIGHT = ['pending', 'queued', 'running', 'paused'];
/** Window used to collapse accidental double-submits of the same campaign. */
const DUPLICATE_WINDOW_MS = 60_000;
const MAX_LEADS_PER_CAMPAIGN = 5_000;
/** Cap on how many campaigns we reconcile per GET so the list never fans out unbounded. */
const RECONCILE_LIMIT = 10;

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: campaigns, error } = await supabase
      .from('campaign_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[campaigns:GET] query failed', error);
      return NextResponse.json({ error: 'Failed to load campaigns.' }, { status: 500 });
    }

    const list = campaigns ?? [];

    // Opportunistic reconcile. Bounded and run in parallel: the previous version
    // awaited one Dograh call per campaign in series, so a dashboard with 30 active
    // campaigns made 30 sequential round-trips on every poll.
    if (DograhClient.isConfigured()) {
      const active = list
        .filter((c) => !isTerminal(c.status) && c.dograh_campaign_id != null)
        .slice(0, RECONCILE_LIMIT);

      await Promise.all(
        active.map(async (campaign) => {
          try {
            const progress = await dograh.getCampaignProgress(Number(campaign.dograh_campaign_id));
            const mapped = mapDograhStatus(progress?.state);
            if (!mapped || mapped === campaign.status) return;

            const patch: Record<string, unknown> = { status: mapped, updated_at: new Date().toISOString() };
            if (isTerminal(mapped)) patch.completed_at = new Date().toISOString();
            if (mapped === 'paused') patch.paused_at = new Date().toISOString();
            if (mapped === 'running') patch.paused_at = null;

            const { error: patchError } = await supabase
              .from('campaign_runs')
              .update(patch)
              .eq('id', campaign.id);

            if (!patchError) Object.assign(campaign, patch);
          } catch (progressErr) {
            // Never let provider flakiness break the dashboard list.
            console.warn(`[campaigns:GET] progress check failed for ${campaign.id}`, progressErr);
          }
        }),
      );
    }

    return NextResponse.json({ campaigns: list });
  } catch (error) {
    console.error('[campaigns:GET] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!DograhClient.isConfigured()) {
    return NextResponse.json(
      { error: 'Calling provider is not configured. Set DOGRAH_API_KEY to launch campaigns.' },
      { status: 503 },
    );
  }

  const supabase = createServerClient();

  // Tracked so the failure path knows exactly what to undo.
  let campaignRunId: string | null = null;
  let claimedLeadIds: string[] = [];
  let dograhCampaignId: number | null = null;
  let campaignStarted = false;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { campaign_name, lead_count, concurrency = 1, target_segment, retry_config, schedule_config } = body as Record<
      string,
      any
    >;

    if (typeof campaign_name !== 'string' || !campaign_name.trim()) {
      return NextResponse.json({ error: 'campaign_name is required' }, { status: 400 });
    }

    const requestedCount = Number(lead_count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAX_LEADS_PER_CAMPAIGN) {
      return NextResponse.json(
        { error: `lead_count must be an integer between 1 and ${MAX_LEADS_PER_CAMPAIGN}` },
        { status: 400 },
      );
    }

    const name = campaign_name.trim();
    const safeConcurrency = Math.min(Math.max(Number(concurrency) || 1, 1), 100);

    // --- Idempotency guard -------------------------------------------------
    // Without this, a double-clicked "Launch" button created two Dograh campaigns
    // over the same leads and dialled every person twice.
    const { data: recent } = await supabase
      .from('campaign_runs')
      .select('*')
      .eq('campaign_name', name)
      .in('status', IN_FLIGHT)
      .gte('created_at', new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          campaign: recent[0],
          message: 'An identical campaign launch is already in progress; returning the existing campaign.',
        },
        { status: 200 },
      );
    }

    // --- Step 1: reserve the campaign row FIRST ---------------------------
    // The old flow started the campaign at Dograh before inserting anything. If the
    // insert then failed, calls were live with no DB record - untrackable and
    // impossible to pause from the UI.
    const { data: reserved, error: reserveError } = await supabase
      .from('campaign_runs')
      .insert({
        campaign_name: name,
        requested_count: requestedCount,
        concurrency: safeConcurrency,
        status: 'pending',
        target_segment: target_segment ?? null,
        retry_config: retry_config ?? {},
        schedule_config: schedule_config ?? {},
      })
      .select()
      .single();

    if (reserveError || !reserved) {
      console.error('[campaigns:POST] failed to reserve campaign row', reserveError);
      return NextResponse.json({ error: 'Could not create the campaign record.' }, { status: 500 });
    }
    campaignRunId = reserved.id;

    // --- Step 2: find candidate leads -------------------------------------
    let query = supabase
      .from('leads')
      .select('id')
      .eq('status', 'new')
      .not('phone', 'is', null);

    if (target_segment?.city) query = query.eq('city', target_segment.city);
    if (target_segment?.property_type) query = query.eq('property_type', target_segment.property_type);

    const { data: candidates, error: leadsError } = await query
      .order('created_at', { ascending: true })
      .limit(requestedCount);

    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }
    if (!candidates || candidates.length === 0) {
      await supabase.from('campaign_runs').delete().eq('id', campaignRunId);
      campaignRunId = null;
      return NextResponse.json({ error: 'No eligible leads found with status "new"' }, { status: 400 });
    }

    // --- Step 3: atomically CLAIM the leads -------------------------------
    // The `.eq('status','new')` filter makes this a compare-and-set: only rows still
    // unclaimed are returned, so two concurrent launches can never dial the same lead.
    // Previously leads were marked queued only at the very end, leaving a long race window.
    const { data: claimed, error: claimError } = await supabase
      .from('leads')
      .update({ status: 'queued', campaign_run_id: campaignRunId })
      .in(
        'id',
        candidates.map((l) => l.id),
      )
      .eq('status', 'new')
      .select('id, name, phone, city, property_type, budget, email');

    if (claimError) {
      throw new Error(`Failed to claim leads: ${claimError.message}`);
    }
    if (!claimed || claimed.length === 0) {
      await supabase.from('campaign_runs').delete().eq('id', campaignRunId);
      campaignRunId = null;
      return NextResponse.json(
        { error: 'All matching leads were just claimed by another campaign. Try again.' },
        { status: 409 },
      );
    }
    claimedLeadIds = claimed.map((l) => l.id);

    // --- Step 4: build + upload the CSV of ACTUALLY claimed leads ---------
    const csvString = buildCampaignCsv(claimed);
    const filename = `campaign_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${Date.now()}.csv`;
    const presigned = await dograh.getPresignedUploadUrl(filename, Buffer.byteLength(csvString, 'utf-8'));
    await dograh.uploadCsvToS3(presigned.upload_url, csvString);

    // --- Step 5: create the campaign at the provider ----------------------
    const workflowId = Number.parseInt(process.env.DOGRAH_WORKFLOW_ID ?? '', 10);
    if (!Number.isFinite(workflowId)) {
      throw new Error('DOGRAH_WORKFLOW_ID is not set to a valid workflow id.');
    }

    const dograhCampaign = await dograh.createCampaign({
      name,
      workflow_id: workflowId,
      source_id: presigned.file_key,
      max_concurrency: safeConcurrency,
      // Reusing the campaign row id means a retried request cannot create a second
      // provider campaign for the same launch.
      idempotencyKey: `campaign-${campaignRunId}`,
      retry_config: retry_config ?? {
        enabled: true,
        max_retries: 2,
        retry_delay_seconds: 120,
        retry_on_busy: true,
        retry_on_no_answer: true,
        retry_on_voicemail: true,
      },
      schedule_config: schedule_config ?? undefined,
      circuit_breaker: {
        enabled: true,
        failure_threshold: 0.5,
        window_seconds: 120,
        min_calls_in_window: 5,
      },
    });
    dograhCampaignId = dograhCampaign.id;

    // Persist the provider id BEFORE starting, so a crash during start still
    // leaves us able to find and stop the campaign.
    await supabase
      .from('campaign_runs')
      .update({
        dograh_campaign_id: dograhCampaignId,
        workflow_id: workflowId,
        source_id: presigned.file_key,
        actual_count: claimed.length,
        status: 'queued',
      })
      .eq('id', campaignRunId);

    // --- Step 6: start dialling -------------------------------------------
    await dograh.startCampaign(dograhCampaignId);
    campaignStarted = true;

    const { data: campaignRun } = await supabase
      .from('campaign_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', campaignRunId)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      campaign: campaignRun ?? reserved,
      leads_queued: claimedLeadIds.length,
      leads_requested: requestedCount,
      dograh_campaign_id: dograhCampaignId,
    });
  } catch (error: any) {
    console.error('[campaigns:POST] launch failed', error);

    // --- Compensating rollback -------------------------------------------
    // If dialling already began we must NOT free the leads (they are being called);
    // instead stop the provider campaign so it cannot keep spending money.
    if (campaignStarted && dograhCampaignId != null) {
      try {
        await dograh.pauseCampaign(dograhCampaignId);
      } catch (pauseErr) {
        console.error('[campaigns:POST] could not pause orphaned provider campaign', pauseErr);
      }
      if (campaignRunId) {
        await supabase
          .from('campaign_runs')
          .update({ status: 'paused', paused_at: new Date().toISOString() })
          .eq('id', campaignRunId);
      }
      return NextResponse.json(
        {
          error:
            'The campaign started but could not be fully recorded, so it has been paused for safety. Review it before resuming.',
          dograh_campaign_id: dograhCampaignId,
        },
        { status: 500 },
      );
    }

    // Nothing was dialled: release the claimed leads and drop the reservation.
    if (claimedLeadIds.length > 0) {
      const { error: rollbackError } = await supabase
        .from('leads')
        .update({ status: 'new', campaign_run_id: null })
        .in('id', claimedLeadIds);
      if (rollbackError) console.error('[campaigns:POST] lead rollback failed', rollbackError);
    }
    if (campaignRunId) {
      await supabase
        .from('campaign_runs')
        .update({ status: 'failed', error_message: String(error?.message ?? error).slice(0, 500) })
        .eq('id', campaignRunId);
    }

    if (error instanceof DograhConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof DograhApiError) {
      return NextResponse.json(
        { error: 'The calling provider rejected the campaign.', providerStatus: error.status },
        { status: error.isClientError ? 422 : 502 },
      );
    }
    return NextResponse.json({ error: 'Campaign launch failed. No calls were placed.' }, { status: 500 });
  }
}
