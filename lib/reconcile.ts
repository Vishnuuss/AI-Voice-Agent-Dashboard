import type { SupabaseClient } from '@supabase/supabase-js';
import { getMaxRetries } from '@/lib/call-behavior';
import { updateLead } from '@/lib/lead-update';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import {
  buildGatheredContext,
  buildNoteLine,
  extractCallSignals,
  extractQaVerdict,
  hasQualificationSignal,
  parseFollowUpDate,
  usableMediaUrl,
} from '@/lib/call-context';
import { DEFAULT_VERTICAL, isWrongVerticalMatch, parseVertical } from '@/lib/verticals';
import type { DograhRunRecord } from '@/types';

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
  // Read once per sweep by the caller and threaded through, rather than
  // re-querying settings for every run record in a large campaign.
  maxRetries?: number,
): Promise<'inserted' | 'duplicate' | 'no_lead' | 'error'> {
  const runId = run.id;
  if (runId == null) return 'error';

  // `.limit(1)` + array, NOT `.maybeSingle()`. maybeSingle ERRORS when more than
  // one row matches, and the error was being discarded - so `data` came back
  // null, the run looked unseen, and every sweep inserted yet another copy and
  // incremented retry_count again. Once a run had two rows it grew without
  // bound: one live lead reached 47 log rows and retry_count 31 for 3 real calls.
  // The unique index (scripts/006) prevents duplicates from arising at all; this
  // makes the check correct even if one ever slips through.
  const { data: existingLogs } = await supabase
    .from('call_logs')
    .select('id')
    .eq('dograh_run_id', runId)
    .limit(1);

  if (existingLogs && existingLogs.length > 0) return 'duplicate';

  const context: Record<string, any> = run.gathered_context ?? {};
  // The CSV row this call was dialled from. THIS is where Dograh puts the
  // identifiers - verified 2026-08-06 against a live record from the same
  // endpoint this sweep reads (GET /api/v1/campaign/{id}/runs):
  //
  //   metadata          -> null
  //   gathered_context  -> {call_disposition, call_id, call_tags,
  //                         mapped_call_disposition, provider}   (no lead_id)
  //   phone_number/phone at top level -> absent
  //   initial_context   -> {phone_number, customer_name, lead_id, campaign_id, ...}
  //
  // Reading only the first three meant leadId and phone were BOTH null on every
  // run, so this function returned 'no_lead' every time and the missed-call
  // sweep had never recovered a single call.
  const initial: Record<string, any> = (run as any).initial_context ?? {};
  const leadId = run.metadata?.lead_id ?? context.lead_id ?? initial.lead_id ?? null;
  const phone = run.phone_number ?? (run as any).phone ?? initial.phone_number ?? null;

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
    const candidate = data?.[0] ?? null;

    // A phone match is a GUESS once the same number can be a lead in more than
    // one business line. If the agent named the business line it was calling
    // for and it disagrees with this lead's, drop the match rather than write a
    // solar call's result onto a loan lead. Inert until both sides carry a
    // vertical - see isWrongVerticalMatch.
    const expectedVertical = context.vertical ?? initial.vertical ?? null;
    if (candidate && isWrongVerticalMatch(candidate.vertical, expectedVertical)) {
      console.warn(
        '[reconcile] phone matched a lead in a different business line; refusing it',
        { runId, leadVertical: candidate.vertical, expected: expectedVertical },
      );
    } else {
      lead = candidate;
    }
  }

  if (!lead) return 'no_lead';

  // Same field mapping as the webhook: the loan workflow reports loan_required /
  // loan_amount / loan_type, not interested / budget / visit_date.
  const signals = extractCallSignals(run as Record<string, any>);

  // Which ladder to score on, same precedence as the webhook: what the agent
  // said it was calling for, then the lead's own column.
  const callVertical = parseVertical(context.vertical ?? initial.vertical) ?? parseVertical(lead.vertical) ?? DEFAULT_VERTICAL;

  const result = scoreCall({
    vertical: callVertical,
    house_ownership: signals.house_ownership,
    solar_planning: signals.solar_planning,
    currently_investing: signals.currently_investing,
    investment_type: signals.investment_type,
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

  const gatheredContext = { ...context, ...buildGatheredContext(signals, result.outcome, undefined, lead.vertical) };

  // Same QA verdict the webhook stores, recovered here for any call whose
  // webhook delivery was missed.
  const qa = extractQaVerdict((run as any).annotations);
  if (qa) gatheredContext.qa = qa;

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
    status: leadStatusFor(result.outcome, nextRetryCount, maxRetries ?? 2),
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
    // Never on a solar call: property_type holds the LOAN type, and the solar
    // answers belong in qual_data where the dashboard reads them.
    if (signals.loan_type && callVertical !== 'solar') update.property_type = signals.loan_type;
    // Solar's two answers get their own columns too (007_solar_fields.sql).
    if (signals.house_ownership) update.house_ownership = signals.house_ownership;
    if (signals.solar_planning !== null) update.solar_planning = signals.solar_planning;

    const followUp = parseFollowUpDate(signals.visit_date);
    if (followUp) update.follow_up_date = followUp;
  }

  // Same missing-column guard as the webhook - see lib/lead-update.ts.
  const { error: updateError } = await updateLead(supabase, lead.id, update);
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
