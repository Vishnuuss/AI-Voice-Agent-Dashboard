import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DograhClient, dograh } from '@/lib/dograh';
import { applyRunResult, isAuthorisedCron } from '@/lib/reconcile';
import { isTerminal, mapDograhStatus } from '@/lib/campaign-state';

/**
 * Reconciles our database against Dograh, recovering anything a missed webhook lost.
 *
 * Runs on a schedule (see vercel.json). Vercel Cron issues GET requests, so both
 * GET and POST are exported - the previous POST-only handler was never invoked by
 * the scheduler.
 */

export const maxDuration = 60;

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** A lead dialling for longer than this is considered stuck and is released. */
const STUCK_LEAD_MINUTES = 60;

async function reconcileCampaign(supabase: ReturnType<typeof createServerClient>, campaign: any) {
  const providerId = Number(campaign.dograh_campaign_id);
  const stats = { inserted: 0, duplicate: 0, no_lead: 0, error: 0 };

  if (!Number.isFinite(providerId)) return stats;

  // Walk every page. The old version only ever fetched page 1 (100 runs), so any
  // campaign larger than that was permanently under-reconciled.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { runs, total } = await dograh.getCampaignRuns(providerId, page, PAGE_SIZE);
    if (!runs.length) break;

    for (const run of runs) {
      const outcome = await applyRunResult(supabase, run as any, campaign.id);
      stats[outcome] += 1;
    }

    if (runs.length < PAGE_SIZE || page * PAGE_SIZE >= (total || 0)) break;
  }

  // Sync the campaign's own status.
  try {
    const progress = await dograh.getCampaignProgress(providerId);
    const mapped = mapDograhStatus(progress?.state);
    if (mapped && mapped !== campaign.status) {
      const patch: Record<string, unknown> = { status: mapped, updated_at: new Date().toISOString() };
      if (isTerminal(mapped)) patch.completed_at = new Date().toISOString();
      if (mapped === 'paused') patch.paused_at = new Date().toISOString();
      await supabase.from('campaign_runs').update(patch).eq('id', campaign.id);
    }
  } catch (err) {
    console.warn(`[cron:reconcile] progress sync failed for ${campaign.id}`, err);
  }

  return stats;
}

/** Frees leads left in `queued` by a crashed launch so they can be dialled again. */
async function releaseStuckLeads(supabase: ReturnType<typeof createServerClient>) {
  const cutoff = new Date(Date.now() - STUCK_LEAD_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update({ status: 'new', campaign_run_id: null })
    .eq('status', 'queued')
    .lt('updated_at', cutoff)
    .select('id');

  if (error) {
    console.warn('[cron:reconcile] stuck lead sweep failed', error);
    return 0;
  }
  return data?.length ?? 0;
}

async function handler(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!DograhClient.isConfigured()) {
    return NextResponse.json({ error: 'Calling provider is not configured.' }, { status: 503 });
  }

  try {
    const supabase = createServerClient();

    // Include queued and paused campaigns: results can arrive for calls that were
    // already in flight when a campaign was paused.
    const { data: campaigns, error } = await supabase
      .from('campaign_runs')
      .select('id, status, dograh_campaign_id')
      .in('status', ['queued', 'running', 'paused'])
      .not('dograh_campaign_id', 'is', null);

    if (error) {
      console.error('[cron:reconcile] failed to load campaigns', error);
      return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
    }

    const totals = { inserted: 0, duplicate: 0, no_lead: 0, error: 0 };

    for (const campaign of campaigns ?? []) {
      try {
        const stats = await reconcileCampaign(supabase, campaign);
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += stats[key];
      } catch (err) {
        console.error(`[cron:reconcile] campaign ${campaign.id} failed`, err);
        totals.error += 1;
      }
    }

    const releasedLeads = await releaseStuckLeads(supabase);

    return NextResponse.json({
      success: true,
      campaigns_checked: campaigns?.length ?? 0,
      ...totals,
      released_stuck_leads: releasedLeads,
    });
  } catch (error) {
    console.error('[cron:reconcile] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
