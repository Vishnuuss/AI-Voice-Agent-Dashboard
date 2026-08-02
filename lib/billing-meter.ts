import type { SupabaseClient } from '@supabase/supabase-js';
import { dograh } from './dograh';
import { hashPhone } from './billing';

/**
 * Reads the meter.
 *
 * Call durations are pulled STRAIGHT FROM DOGRAH, on our own server, into our
 * own billing database — never from the client's Supabase copy. He owns that
 * project and can edit or delete rows in it; if the bill were computed from
 * there, deleting call_logs would delete the charges with it. Metering from
 * Dograh means his bill does not move no matter what he does to his database.
 *
 * Idempotency: call_usage.dograh_run_id is UNIQUE NOT NULL, so re-running this
 * over the same window is free. Unlike the client's call_logs (where the run id
 * is nullable and duplicates are already possible), we refuse to meter a run we
 * cannot identify.
 */

/** Dograh disposition -> the outcome vocabulary billing understands. */
function deriveOutcome(run: any): string {
  const disposition = String(
    run?.gathered_context?.mapped_call_disposition ??
    run?.gathered_context?.call_disposition ??
    '',
  ).toLowerCase();

  if (!disposition) return run?.is_completed ? 'completed' : 'unknown';
  if (disposition.includes('no_answer') || disposition.includes('noanswer')) return 'no_answer';
  if (disposition.includes('busy')) return 'busy';
  if (disposition.includes('voicemail') || disposition.includes('machine')) return 'voicemail';
  if (disposition.includes('failed') || disposition.includes('error')) return 'failed';
  if (disposition.includes('cancel')) return 'cancelled';
  // user_qualified, user_not_qualified, user_speech ... all mean someone talked.
  return 'completed';
}

function durationOf(run: any): number {
  const raw =
    run?.cost_info?.call_duration_seconds ??
    run?.usage_info?.call_duration_seconds ??
    run?.duration;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export interface MeterResult {
  campaignsScanned: number;
  runsSeen: number;
  inserted: number;
  alreadyKnown: number;
  errors: number;
}

/**
 * Pull every run for one campaign into call_usage.
 *
 * Stops early once a page yields nothing new AND we are past `sinceIso`, so the
 * routine stays cheap when run every few minutes against a long history.
 */
export async function meterCampaign(
  billing: SupabaseClient,
  campaignId: number,
  opts: { sinceIso?: string; maxPages?: number; pageSize?: number; accountId?: string } = {},
): Promise<Omit<MeterResult, 'campaignsScanned'>> {
  const { sinceIso, maxPages = 20, pageSize = 100, accountId = 'default' } = opts;
  const out = { runsSeen: 0, inserted: 0, alreadyKnown: 0, errors: 0 };

  for (let page = 1; page <= maxPages; page += 1) {
    let runs: any[] = [];
    try {
      const res = await dograh.getCampaignRuns(campaignId, page, pageSize);
      runs = res.runs ?? [];
    } catch (err: any) {
      console.error('[meter] could not fetch runs', { campaignId, page, error: err?.message });
      out.errors += 1;
      break;
    }
    if (runs.length === 0) break;

    const rows = runs
      .filter((run) => Number.isFinite(Number(run?.id)))
      .map((run) => ({
        account_id: accountId,
        dograh_run_id: Number(run.id),
        campaign_id: Number(run?.initial_context?.campaign_id ?? campaignId) || campaignId,
        duration_seconds: durationOf(run),
        call_mode: run?.mode ?? run?.initial_context?.provider ?? null,
        outcome: deriveOutcome(run),
        phone_hash: hashPhone(run?.initial_context?.phone_number ?? run?.phone_number),
        usage_info: run?.usage_info ?? null,
        cost_info: run?.cost_info ?? null,
        called_at: run?.created_at ?? new Date().toISOString(),
      }));

    out.runsSeen += rows.length;

    if (rows.length > 0) {
      // ignoreDuplicates keeps this a pure insert-if-absent: a run we have
      // already metered (and possibly already charged for) is never rewritten,
      // so a re-run cannot alter the basis of a charge that has been issued.
      const { data, error } = await billing
        .from('call_usage')
        .upsert(rows, { onConflict: 'dograh_run_id', ignoreDuplicates: true })
        .select('id');

      if (error) {
        console.error('[meter] upsert failed', { campaignId, page, error: error.message });
        out.errors += 1;
      } else {
        const newRows = data?.length ?? 0;
        out.inserted += newRows;
        out.alreadyKnown += rows.length - newRows;
      }
    }

    if (runs.length < pageSize) break;

    // Everything on this page predates the window we care about, and runs come
    // back newest-first, so nothing older will be new either.
    if (sinceIso) {
      const oldest = rows[rows.length - 1]?.called_at;
      if (oldest && oldest < sinceIso) break;
    }
  }

  return out;
}

/** Pull runs for every campaign Dograh knows about. */
export async function meterAllCampaigns(
  billing: SupabaseClient,
  opts: { sinceIso?: string; accountId?: string } = {},
): Promise<MeterResult> {
  const total: MeterResult = {
    campaignsScanned: 0, runsSeen: 0, inserted: 0, alreadyKnown: 0, errors: 0,
  };

  let campaigns: any[] = [];
  try {
    campaigns = await dograh.listCampaigns();
  } catch (err: any) {
    console.error('[meter] could not list campaigns', err?.message);
    total.errors += 1;
    return total;
  }

  for (const campaign of campaigns) {
    const id = Number(campaign?.id);
    if (!Number.isFinite(id)) continue;
    total.campaignsScanned += 1;
    const one = await meterCampaign(billing, id, opts);
    total.runsSeen += one.runsSeen;
    total.inserted += one.inserted;
    total.alreadyKnown += one.alreadyKnown;
    total.errors += one.errors;
  }

  return total;
}

/**
 * Backfill usage_info for metered calls that arrived without it.
 *
 * The campaign-runs list returns usage_info: null, so the token and character
 * counts that provider cost is derived from only appear on a per-run fetch.
 * That is one HTTP call per run, so it is bounded per tick and runs in the
 * background — it feeds the operator margin view only and never blocks billing.
 */
export async function enrichUsageInfo(
  billing: SupabaseClient,
  opts: { workflowId?: number; limit?: number } = {},
): Promise<{ attempted: number; enriched: number; failed: number }> {
  const workflowId = opts.workflowId ?? Number(process.env.DOGRAH_WORKFLOW_ID ?? 1);
  const limit = opts.limit ?? 25;
  const out = { attempted: 0, enriched: 0, failed: 0 };

  const { data, error } = await billing
    .from('call_usage')
    .select('id, dograh_run_id')
    .is('usage_info', null)
    .gt('duration_seconds', 0)
    .order('called_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[meter] could not list rows needing enrichment', error.message);
    return out;
  }

  for (const row of data ?? []) {
    out.attempted += 1;
    try {
      const run = await dograh.getWorkflowRun(workflowId, row.dograh_run_id);
      if (!run?.usage_info) { out.failed += 1; continue; }
      const { error: updateError } = await billing
        .from('call_usage')
        .update({ usage_info: run.usage_info })
        .eq('id', row.id);
      if (updateError) { out.failed += 1; continue; }
      out.enriched += 1;
    } catch (err: any) {
      console.error('[meter] enrich failed', { run: row.dograh_run_id, error: err?.message });
      out.failed += 1;
    }
  }

  return out;
}
