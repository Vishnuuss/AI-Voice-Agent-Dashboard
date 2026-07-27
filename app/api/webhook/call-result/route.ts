import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { leadStatusFor, scoreCall } from '@/lib/call-scoring';
import type { WebhookPayload } from '@/types';

/**
 * PUBLIC endpoint - receives call results from Dograh after each call ends.
 *
 * Auth:        X-API-Key or X-Webhook-Secret must equal DOGRAH_WEBHOOK_SECRET.
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

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.DOGRAH_WEBHOOK_SECRET;
    if (!expectedSecret) {
      // Fail closed. Previously, a missing secret combined with a missing header
      // still produced a 401 by luck rather than by design.
      console.error('[webhook] DOGRAH_WEBHOOK_SECRET is not configured; rejecting delivery.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const provided = request.headers.get('x-api-key') ?? request.headers.get('x-webhook-secret');
    if (!secretMatches(provided, expectedSecret)) {
      // Never log any portion of the presented credential.
      console.warn('[webhook] rejected delivery: invalid secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as WebhookPayload | null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const supabase = createServerClient();
    const runId = payload.run_id ?? null;

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

    if (payload.lead_id) {
      const { data } = await supabase.from('leads').select('*').eq('id', payload.lead_id).maybeSingle();
      lead = data;
    }
    if (!lead && payload.phone) {
      // Phone is not guaranteed unique, so take the most recently contacted match.
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('phone', payload.phone)
        .order('last_attempt_at', { ascending: false, nullsFirst: false })
        .limit(1);
      lead = data?.[0] ?? null;
    }

    if (!lead) {
      // Acknowledge so the provider stops retrying an event we can never match.
      console.warn('[webhook] no matching lead for run', runId);
      return NextResponse.json({ success: false, reason: 'lead_not_found' }, { status: 200 });
    }

    // --- Score the call ---------------------------------------------------
    const result = scoreCall({
      interested: payload.interested,
      budget: payload.budget,
      visit_date: payload.visit_date,
      outcome: payload.outcome,
      duration: (payload as any).duration ?? (payload as any).call_duration,
    });

    const gatheredContext: Record<string, any> = {};
    if (payload.interested !== null && payload.interested !== undefined)
      gatheredContext.interested = payload.interested;
    if (payload.budget) gatheredContext.budget_confirmed = payload.budget;
    if (payload.visit_date) gatheredContext.preferred_visit_date = payload.visit_date;
    gatheredContext.call_outcome = result.outcome;
    if (payload.notes) gatheredContext.call_notes = payload.notes;

    const calledAt = payload.call_time ?? new Date().toISOString();
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
      recording_url: payload.recording ?? null,
      transcript_url: payload.transcript ?? null,
      gathered_context: gatheredContext,
      cost_info: (payload as any).cost_info ?? {},
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
    const noteLine = [
      `[${new Date(calledAt).toISOString().slice(0, 16).replace('T', ' ')}]`,
      `attempt ${nextRetryCount}`,
      `outcome: ${result.outcome}`,
      result.answered ? `score: ${result.score}` : null,
      payload.budget ? `budget: ${payload.budget}` : null,
      payload.visit_date ? `visit: ${payload.visit_date}` : null,
      payload.notes ? String(payload.notes) : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const notes = [lead.notes, noteLine].filter(Boolean).join('\n').slice(-MAX_NOTES_LENGTH);

    const update: Record<string, any> = {
      status,
      call_outcome: result.outcome,
      last_attempt_at: calledAt,
      retry_count: nextRetryCount,
      notes,
    };

    // Only overwrite scoring fields when the call actually produced signal, so a
    // later unanswered retry cannot wipe a good score from an earlier conversation.
    if (result.answered) {
      update.score = result.score;
      update.qualification = result.qualification;
      update.qual_data = gatheredContext;
      if (payload.recording) update.recording_url = payload.recording;
      if (payload.transcript) update.transcript_url = payload.transcript;
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
