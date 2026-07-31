import type { SupabaseClient } from '@supabase/supabase-js';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import {
  buildGatheredContext,
  buildNoteLine,
  extractCallSignals,
  hasQualificationSignal,
  parseFollowUpDate,
  usableMediaUrl,
} from '@/lib/call-context';
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

  // Same field mapping as the webhook: the loan workflow reports loan_required /
  // loan_amount / loan_type, not interested / budget / visit_date.
  const signals = extractCallSignals(run as Record<string, any>);

  const result = scoreCall({
    interested: signals.interested,
    budget: signals.budget,
    visit_date: signals.visit_date,
    loan_type: signals.loan_type,
    profession: signals.profession,
    do_not_call: signals.do_not_call,
    // Dograh run records carry no `status` at all: the outcome lives in
    // gathered_context.call_disposition ("user_hangup", "no_answer", ...) and
    // completion is reported via is_completed.
    outcome:
      run.status ??
      context.mapped_call_disposition ??
      context.call_disposition ??
      ((run as any).is_completed ? 'completed' : undefined),
    duration: (run as any).cost_info?.call_duration_seconds ?? run.duration,
  });

  const gatheredContext = { ...context, ...buildGatheredContext(signals, result.outcome) };

  const nextRetryCount = (lead.retry_count ?? 0) + 1;
  const calledAt = run.created_at ?? run.started_at ?? new Date().toISOString();

  const { error: insertError } = await supabase.from('call_logs').insert({
    lead_id: lead.id,
    campaign_run_id: campaignRunId ?? lead.campaign_run_id ?? null,
    dograh_run_id: runId,
    attempt_no: nextRetryCount,
    outcome: result.outcome,
    duration: result.durationSeconds,
    // Dograh's run records carry storage keys ("recordings/23.wav") in these
    // fields and only a real link in the *_public_url variants, so prefer those
    // and discard anything that is not fetchable.
    recording_url: usableMediaUrl((run as any).recording_public_url) ?? usableMediaUrl(run.recording_url),
    transcript_url: usableMediaUrl((run as any).transcript_public_url) ?? usableMediaUrl(run.transcript_url),
    gathered_context: gatheredContext,
    cost_info: (run as any).cost_info ?? {},
    called_at: calledAt,
  });

  if (insertError) {
    if (insertError.code === '23505') return 'duplicate';
    console.error('[reconcile] call_log insert failed', insertError);
    return 'error';
  }

  const noteLine = buildNoteLine(signals, {
    prefix: `[reconciled ${new Date().toISOString().slice(0, 16).replace('T', ' ')}]`,
    attempt: nextRetryCount,
    outcome: result.outcome,
    score: result.answered ? result.score : null,
  });

  const update: Record<string, any> = {
    status: leadStatusFor(result.outcome, nextRetryCount, MAX_RETRIES),
    call_outcome: result.outcome,
    last_attempt_at: calledAt,
    retry_count: nextRetryCount,
    notes: [lead.notes, noteLine].filter(Boolean).join('\n').slice(-MAX_NOTES_LENGTH),
  };

  // Same guard as the webhook: an answered-but-empty call must not overwrite the
  // score a real conversation already produced.
  const carriesSignal = hasQualificationSignal(signals);
  const neverScored = lead.score === null || lead.score === undefined;

  if (result.answered && (carriesSignal || neverScored)) {
    update.score = result.score;
    update.qualification = result.qualification;
    update.qual_data = gatheredContext;
    const recording = usableMediaUrl((run as any).recording_public_url) ?? usableMediaUrl(run.recording_url);
    const transcript = usableMediaUrl((run as any).transcript_public_url) ?? usableMediaUrl(run.transcript_url);
    if (recording) update.recording_url = recording;
    if (transcript) update.transcript_url = transcript;
    if (signals.budget) update.budget = signals.budget;
    if (signals.loan_type) update.property_type = signals.loan_type;

    const followUp = parseFollowUpDate(signals.visit_date);
    if (followUp) update.follow_up_date = followUp;
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
