import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import {
  buildGatheredContext,
  buildNoteLine,
  cleanNumber,
  cleanString,
  extractCallSignals,
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

const MAX_RETRIES = 2;
const MAX_NOTES_LENGTH = 2_000;

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
        if (data?.[0]) {
          lead = data[0];
          break;
        }
      }
    }

    if (!lead) {
      // Acknowledge so the provider stops retrying an event we can never match.
      console.warn('[webhook] no matching lead for run', runId);
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
    });

    const gatheredContext = buildGatheredContext(signals, result.outcome);
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
    const status = leadStatusFor(result.outcome, nextRetryCount, MAX_RETRIES);

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
