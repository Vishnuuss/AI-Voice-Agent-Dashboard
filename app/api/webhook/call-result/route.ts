import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { createBillingClient, isBillingConfigured } from '@/lib/supabase-billing';
import { getBillingConfig, postDebit, toCredits } from '@/lib/billing';
import { meterSingleRun } from '@/lib/billing-meter';
import { enforceBalanceGuard } from '@/lib/billing-guard';
import { getMaxRetries } from '@/lib/call-behavior';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import { isWrongVerticalMatch, parseVertical } from '@/lib/verticals';
import {
  buildGatheredContext,
  buildNoteLine,
  cleanNumber,
  cleanString,
  extractCallSignals,
  extractQaVerdict,
  flattenPayload,
  hasQualificationSignal,
  parseFollowUpDate,
  usableMediaUrl,
} from '@/lib/call-context';

/**
 * PUBLIC endpoint - receives call results from Dograh after each call ends.
 *
 * Auth:        X-API-Key, X-Webhook-Secret or Authorization: Bearer must equal
 *              DOGRAH_WEBHOOK_SECRET.
 * Idempotency: enforced on dograh_run_id. A duplicate delivery never re-scores a
 *              lead or re-increments retry_count.
 *
 * Any payload we cannot act on is acknowledged with 200 - returning 4xx/5xx makes
 * the provider redeliver the same event indefinitely.
 */

const MAX_NOTES_LENGTH = 2_000;

// The handler now also reads the run back from Dograh and posts the charge, so
// give it room beyond the platform's short default.
export const maxDuration = 30;

/** Constant-time comparison so the secret cannot be recovered by timing the response. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Dograh can be configured with any of these header styles; accept all three. */
function presentedSecret(request: Request): string | null {
  const auth = request.headers.get('authorization');
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  return request.headers.get('x-api-key') ?? request.headers.get('x-webhook-secret') ?? bearer;
}

/**
 * Charge for the call that just ended, right now.
 *
 * Billing used to happen ONLY on the ten-minute reconcile cron, so the balance
 * the client watches during a campaign stayed frozen while calls completed.
 * That is the bug: the meter was correct but invisibly late.
 *
 * This is a latency optimisation, not the correctness guarantee — the cron
 * sweep is still what makes "no call escapes billing" true. Both paths build
 * the idempotency key with debitIdempotencyKey(), so whichever runs second
 * posts nothing. Consequently NOTHING here may throw or return an error: the
 * webhook's job is to record the call, and a bad minute in accounting must not
 * turn into a redelivery loop.
 */
async function chargeForRun(
  clientDb: ReturnType<typeof createServerClient>,
  runId: number | null,
): Promise<void> {
  if (!runId || !isBillingConfigured()) return;

  try {
    const billing = createBillingClient();
    const config = await getBillingConfig(billing);

    const call = await meterSingleRun(billing, runId);
    if (!call) return;   // Unreadable from Dograh; the cron sweep will get it.

    const debit = await postDebit(billing, call as any, config);
    if (!debit.posted) return;

    // Stop the calling immediately if that charge emptied the balance, rather
    // than letting up to ten more minutes of calls run on credit.
    if (debit.balanceMilli !== null) {
      await enforceBalanceGuard(clientDb, config, debit.balanceMilli);
    }

    console.info('[webhook] charged call', {
      run: runId,
      credits: toCredits(debit.amountMilli),
      balance_credits: debit.balanceMilli === null ? null : toCredits(debit.balanceMilli),
    });
  } catch (err: any) {
    console.error('[webhook] inline billing failed; cron sweep will retry', {
      run: runId,
      error: err?.message,
    });
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.DOGRAH_WEBHOOK_SECRET;
    if (!expectedSecret) {
      // Fail closed. Previously, a missing secret combined with a missing header
      // still produced a 401 by luck rather than by design.
      console.error('[webhook] DOGRAH_WEBHOOK_SECRET is not configured; rejecting delivery.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    if (!secretMatches(presentedSecret(request), expectedSecret)) {
      // Never log any portion of the presented credential.
      console.warn('[webhook] rejected delivery: invalid secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = (await request.json().catch(() => null)) as Record<string, any> | null;
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Dograh renders its payload from a Jinja template, which means every value
    // arrives as a string and an unresolved variable arrives as "", "None" or
    // "Undefined" rather than being omitted - and the extracted variables may sit
    // flat on the payload or nested under gathered_context. flattenPayload +
    // extractCallSignals handle every one of those shapes.
    const flat = flattenPayload(raw);
    const signals = extractCallSignals(raw);

    const runId = cleanNumber(flat.run_id ?? flat.workflow_run_id ?? flat.call_id ?? flat.id);
    const phone = cleanString(flat.phone ?? flat.phone_number ?? flat.to_number ?? flat.customer_phone);
    const leadIdFromPayload = cleanString(flat.lead_id ?? flat.external_id);
    // Dograh's template maps `outcome` to gathered_context.call_disposition; keep
    // the other spellings as fallbacks for manual/legacy deliveries.
    const outcomeRaw =
      cleanString(
        flat.outcome ??
          flat.call_disposition ??
          flat.mapped_call_disposition ??
          flat.status ??
          flat.call_status,
      ) ?? 'completed';
    const durationRaw =
      cleanNumber(flat.duration ?? flat.call_duration_seconds ?? flat.call_duration) ??
      cleanNumber(raw?.cost_info?.call_duration_seconds) ??
      0;
    // Prefer the public URL variants - the plain ones require an authenticated
    // session, so the dashboard cannot play them back for the client. Anything
    // that is not an absolute link (Dograh sends storage keys like
    // "recordings/23.wav") is dropped rather than stored as a dead link.
    const recording = usableMediaUrl(flat.recording_public_url ?? flat.recording ?? flat.recording_url);
    const transcript = usableMediaUrl(flat.transcript_public_url ?? flat.transcript ?? flat.transcript_url);
    const callTime = cleanString(flat.call_time ?? flat.ended_at ?? flat.created_at);

    const supabase = createServerClient();

    // --- Idempotency pre-check -------------------------------------------
    if (runId) {
      const { data: existingLog } = await supabase
        .from('call_logs')
        .select('id')
        .eq('dograh_run_id', runId)
        .maybeSingle();

      if (existingLog) {
        return NextResponse.json({ message: 'Already processed', duplicate: true }, { status: 200 });
      }
    }

    // --- Resolve the lead -------------------------------------------------
    let lead: any = null;

    if (leadIdFromPayload) {
      const { data } = await supabase.from('leads').select('*').eq('id', leadIdFromPayload).maybeSingle();
      lead = data;
    }
    // The business line this call was FOR, taken raw from the payload and left
    // null when the agent did not say. Deliberately NOT signals.vertical: that
    // one applies DEFAULT_VERTICAL ('loan') whenever the field is absent, so an
    // agent that simply forgets to send `vertical` would look like it said
    // "loan" and every real-estate result matched by phone would be thrown away.
    // Null here means "no opinion", which leaves the guard below inert.
    const expectedVertical = parseVertical(
      flat.vertical ?? flat.business_line ?? flat.product_line ?? flat.agent_type,
    );

    if (!lead && phone) {
      // Phone is not guaranteed unique, so take the most recently contacted match.
      // Also try the bare 10-digit form: the CSV stores +91XXXXXXXXXX but some
      // providers report the number back without the country code.
      const candidates = [phone];
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        const last10 = digits.slice(-10);
        candidates.push(last10, `+91${last10}`, `91${last10}`);
      }

      for (const candidate of candidates) {
        const { data } = await supabase
          .from('leads')
          .select('*')
          .eq('phone', candidate)
          .order('last_attempt_at', { ascending: false, nullsFirst: false })
          .limit(1);
        const match = data?.[0];
        if (!match) continue;

        // Matching by phone is a guess once the same number can be a lead in
        // more than one business line - `leads.phone` is no longer unique. If
        // this call's agent named its business line and it disagrees with the
        // lead's, refuse the match: an unmatched call is a logged warning, but
        // writing a solar call's score and recording onto the same person's
        // loan lead is invisible and corrupts what the client bills from.
        if (isWrongVerticalMatch(match.vertical, expectedVertical)) {
          console.warn('[webhook] phone matched a lead in a different business line; refusing it', {
            runId,
            leadVertical: match.vertical,
            expected: expectedVertical,
          });
          continue;
        }

        lead = match;
        break;
      }
    }

    if (!lead) {
      // Acknowledge so the provider stops retrying an event we can never match.
      console.warn('[webhook] no matching lead for run', runId);
      // Still bill it. A call we cannot match to a lead was still dialled, still
      // connected and still cost money; the charge is metered from Dograh and
      // does not depend on the lead at all.
      await chargeForRun(supabase, runId);
      return NextResponse.json({ success: false, reason: 'lead_not_found' }, { status: 200 });
    }

    // --- Score the call ---------------------------------------------------
    const result = scoreCall({
      interested: signals.interested,
      budget: signals.budget,
      visit_date: signals.visit_date,
      loan_type: signals.loan_type,
      profession: signals.profession,
      do_not_call: signals.do_not_call,
      outcome: outcomeRaw,
      duration: durationRaw,
      // The agent scores the call itself (100 named a loan type / 50 needs a loan
      // but no type / 0 not interested). When present it wins outright - the
      // additive rules below it assume budget, income and occupation questions
      // the two-question agent no longer asks, and would mark a perfect call ~60.
      lead_score: signals.lead_score,
    });

    const gatheredContext = buildGatheredContext(
      signals,
      result.outcome,
      { score: result.score, scoredBy: result.scoredBy, reason: result.reason },
      lead.vertical,
    );

    // Dograh's QA node grades the call (DEAD_AIR, HEARING_ISSUES, READ_OPTION_LIST,
    // GUESSED_MISHEARD, ...). Storing it here is what turns the dashboard into a
    // feedback loop: the Reports page aggregates these tags so recurring agent
    // faults are visible instead of having to be found by listening to calls.
    const qa = extractQaVerdict(raw?.qa ?? flat.qa ?? raw?.annotations);
    if (qa) gatheredContext.qa = qa;
    const calledAt = callTime ?? new Date().toISOString();
    const nextRetryCount = (lead.retry_count ?? 0) + 1;

    // --- Insert the call log ----------------------------------------------
    // This insert is the idempotency barrier. If a unique index exists on
    // dograh_run_id, a concurrent duplicate delivery fails here with 23505 and we
    // stop - so the lead is never scored or incremented twice.
    const { error: insertError } = await supabase.from('call_logs').insert({
      lead_id: lead.id,
      campaign_run_id: lead.campaign_run_id ?? null,
      dograh_run_id: runId,
      attempt_no: nextRetryCount,
      outcome: result.outcome,
      duration: result.durationSeconds,
      recording_url: recording,
      transcript_url: transcript,
      gathered_context: gatheredContext,
      cost_info: raw?.cost_info ?? {},
      called_at: calledAt,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ message: 'Already processed', duplicate: true }, { status: 200 });
      }
      // The log is our audit trail; if it cannot be written, do not mutate the lead.
      console.error('[webhook] failed to insert call_log', insertError);
      return NextResponse.json({ error: 'Failed to record call' }, { status: 500 });
    }

    // --- Update the lead --------------------------------------------------
    const maxRetries = await getMaxRetries(supabase);
    const status = leadStatusFor(result.outcome, nextRetryCount, maxRetries);

    // Append-only notes previously grew without bound across retries.
    const noteLine = buildNoteLine(signals, {
      prefix: `[${new Date(calledAt).toISOString().slice(0, 16).replace('T', ' ')}]`,
      attempt: nextRetryCount,
      outcome: result.outcome,
      score: result.answered ? result.score : null,
    });

    const notes = [lead.notes, noteLine].filter(Boolean).join('\n').slice(-MAX_NOTES_LENGTH);

    const update: Record<string, any> = {
      status,
      call_outcome: result.outcome,
      last_attempt_at: calledAt,
      retry_count: nextRetryCount,
      notes,
    };

    // Only overwrite scoring fields when the call actually produced signal, so
    // neither a later unanswered retry nor an answered-but-empty call (customer
    // picks up and hangs up immediately) can wipe a good score from an earlier
    // real conversation. A lead that has never been scored still gets its first
    // score so nothing is left blank.
    const carriesSignal = hasQualificationSignal(signals);
    const neverScored = lead.score === null || lead.score === undefined;

    if (result.answered && (carriesSignal || neverScored)) {
      update.score = result.score;
      update.qualification = result.qualification;
      update.qual_data = gatheredContext;
      if (recording) update.recording_url = recording;
      if (transcript) update.transcript_url = transcript;
      if (signals.budget) update.budget = signals.budget;
      if (signals.loan_type) update.property_type = signals.loan_type;
      if (signals.customer_name && !lead.name) update.name = signals.customer_name;

      // The Follow-ups page reads leads.follow_up_date; nothing used to set it, so
      // that page was permanently empty even after a customer asked for a callback.
      const followUp = parseFollowUpDate(signals.visit_date);
      if (followUp) update.follow_up_date = followUp;
    }

    const { error: updateError } = await supabase.from('leads').update(update).eq('id', lead.id);

    if (updateError) {
      console.error('[webhook] failed to update lead', updateError);
      // The call_log is already written, so report failure and let the provider retry;
      // the idempotency barrier makes that retry safe.
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    // Last, so the call record and the lead are already safe: the balance moves
    // as soon as the call ends instead of on the next cron tick.
    await chargeForRun(supabase, runId);

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      outcome: result.outcome,
      score: result.answered ? result.score : null,
      status,
    });
  } catch (error) {
    console.error('[webhook] unexpected error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Convenience probe so you can confirm from a browser that the endpoint is
 * deployed and configured, without exposing whether any given secret is correct.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: 'dograh call-result webhook',
    method: 'POST',
    configured: Boolean(process.env.DOGRAH_WEBHOOK_SECRET),
    accepted_headers: ['X-API-Key', 'X-Webhook-Secret', 'Authorization: Bearer'],
  });
}
