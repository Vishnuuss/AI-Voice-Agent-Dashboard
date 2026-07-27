import type { SupabaseClient } from '@supabase/supabase-js';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import type { DograhRunRecord } from '@/types';

const MAX_RETRIES = 2;
const MAX_NOTES_LENGTH = 2_000;

/**
 * Applies a Dograh run record to our database, using exactly the same scoring and
 * column names as the webhook handler.
 *
 * The cron previously carried its own copy of the scoring rules and wrote to
 * columns that did not exist (`direction`, `gathered_data`), while ignoring every
 * insert error - so reconciliation appeared to succeed while saving nothing.
 */
export async function applyRunResult(
  supabase: SupabaseClient,
  run: DograhRunRecord & Record<string, any>,
  campaignRunId?: string | null,
): Promise<'inserted' | 'duplicate' | 'no_lead' | 'error'> {
  const runId = run.id;
  if (runId == null) return 'error';

  const { data: existingLog } = await supabase
    .from('call_logs')
    .select('id')
    .eq('dograh_run_id', runId)
    .maybeSingle();

  if (existingLog) return 'duplicate';

  const context: Record<string, any> = run.gathered_context ?? {};
  const leadId = run.metadata?.lead_id ?? context.lead_id ?? null;
  const phone = run.phone_number ?? run.phone ?? null;

  let lead: any = null;
  if (leadId) {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    lead = data;
  }
  if (!lead && phone) {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .order('last_attempt_at', { ascending: false, nullsFirst: false })
      .limit(1);
    lead = data?.[0] ?? null;
  }

  if (!lead) return 'no_lead';

  const result = scoreCall({
    interested: context.interested,
    budget: context.budget_confirmed ?? context.budget,
    visit_date: context.visit_date ?? context.preferred_visit_date,
    outcome: run.status,
    duration: run.duration,
  });

  const nextRetryCount = (lead.retry_count ?? 0) + 1;
  const calledAt = run.created_at ?? run.started_at ?? new Date().toISOString();

  const { error: insertError } = await supabase.from('call_logs').insert({
    lead_id: lead.id,
    campaign_run_id: campaignRunId ?? lead.campaign_run_id ?? null,
    dograh_run_id: runId,
    attempt_no: nextRetryCount,
    outcome: result.outcome,
    duration: result.durationSeconds,
    recording_url: run.recording_url ?? null,
    transcript_url: run.transcript_url ?? null,
    gathered_context: context,
    cost_info: run.cost_info ?? {},
    called_at: calledAt,
  });

  if (insertError) {
    if (insertError.code === '23505') return 'duplicate';
    console.error('[reconcile] call_log insert failed', insertError);
    return 'error';
  }

  const noteLine = [
    `[reconciled ${new Date().toISOString().slice(0, 16).replace('T', ' ')}]`,
    `attempt ${nextRetryCount}`,
    `outcome: ${result.outcome}`,
    run.summary ? String(run.summary) : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const update: Record<string, any> = {
    status: leadStatusFor(result.outcome, nextRetryCount, MAX_RETRIES),
    call_outcome: result.outcome,
    last_attempt_at: calledAt,
    retry_count: nextRetryCount,
    notes: [lead.notes, noteLine].filter(Boolean).join('\n').slice(-MAX_NOTES_LENGTH),
  };

  if (result.answered) {
    update.score = result.score;
    update.qualification = result.qualification;
    update.qual_data = context;
    if (run.recording_url) update.recording_url = run.recording_url;
    if (run.transcript_url) update.transcript_url = run.transcript_url;
  }

  const { error: updateError } = await supabase.from('leads').update(update).eq('id', lead.id);
  if (updateError) {
    console.error('[reconcile] lead update failed', updateError);
    return 'error';
  }

  return 'inserted';
}

/** Authorises a cron request from either Vercel Cron or a manual trigger. */
export function isAuthorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; the old code only
  // accepted `x-cron-secret`, so scheduled invocations were always rejected.
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get('x-cron-secret') === secret;
}
