import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import type { WebhookPayload } from '@/types';

/**
 * PUBLIC endpoint — receives call results from Dograh after each call ends.
 * 
 * Auth: X-API-Key or X-Webhook-Secret header must match DOGRAH_WEBHOOK_SECRET.
 * Idempotent: duplicate deliveries (same dograh_run_id) return 200 without reprocessing.
 */
export async function POST(request: Request) {
  try {
    // --- Step 1: Validate webhook secret ---
    const apiKey =
      request.headers.get('x-api-key') ||
      request.headers.get('x-webhook-secret');

    if (apiKey !== process.env.DOGRAH_WEBHOOK_SECRET) {
      console.warn('Webhook auth failed. Received key:', apiKey?.substring(0, 8) + '...');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: WebhookPayload = await request.json();
    const supabase = createServerClient();

    // --- Step 2: Idempotency check ---
    if (payload.run_id) {
      const { data: existingLog } = await supabase
        .from('call_logs')
        .select('id')
        .eq('dograh_run_id', payload.run_id)
        .maybeSingle();

      if (existingLog) {
        return NextResponse.json({ message: 'Already processed' }, { status: 200 });
      }
    }

    // --- Step 3: Find the lead ---
    let lead = null;

    // Primary: match by lead_id (our Supabase UUID, passed via initial_context)
    if (payload.lead_id) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('id', payload.lead_id)
        .maybeSingle();
      lead = data;
    }

    // Fallback: match by phone number
    if (!lead && payload.phone) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('phone', payload.phone)
        .maybeSingle();
      lead = data;
    }

    if (!lead) {
      console.warn('Webhook received for unknown lead:', payload.lead_id, payload.phone);
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // --- Step 4: Calculate score from gathered_context ---
    let score = 0;

    // Interested: +40
    if (
      payload.interested === true ||
      payload.interested === 'true' ||
      payload.outcome === 'interested'
    ) {
      score += 40;
    }

    // Budget confirmed: +20
    if (payload.budget && payload.budget !== '' && payload.budget !== 'null') {
      score += 20;
    }

    // Visit date set: +20
    if (payload.visit_date && payload.visit_date !== '' && payload.visit_date !== 'null') {
      score += 20;
    }

    // Call completed (not no-answer/busy): +10
    if (payload.outcome && payload.outcome !== 'no-answer' && payload.outcome !== 'busy' && payload.outcome !== 'failed') {
      score += 10;
    }

    // Call had duration (answered): +10
    score += 10; // If we received a webhook, the call happened

    score = Math.min(score, 100);

    const qualification =
      score >= 60 ? 'qualified' : score > 0 ? 'not_qualified' : null;

    // Determine call_outcome for the lead
    let callOutcome: string = 'completed';
    if (payload.outcome === 'no-answer' || payload.outcome === 'busy' || payload.outcome === 'failed') {
      callOutcome = payload.outcome;
    }

    // --- Step 5: Insert call_log ---
    const gatheredContext: Record<string, any> = {};
    if (payload.interested !== null && payload.interested !== undefined) gatheredContext.interested = payload.interested;
    if (payload.budget) gatheredContext.budget_confirmed = payload.budget;
    if (payload.visit_date) gatheredContext.preferred_visit_date = payload.visit_date;
    if (payload.outcome) gatheredContext.call_outcome = payload.outcome;
    if (payload.notes) gatheredContext.call_notes = payload.notes;

    const { error: insertError } = await supabase.from('call_logs').insert({
      lead_id: lead.id,
      campaign_run_id: lead.campaign_run_id || null,
      dograh_run_id: payload.run_id || null,
      attempt_no: (lead.retry_count || 0) + 1,
      outcome: callOutcome,
      duration: 0, // Dograh webhook doesn't send duration as separate field
      recording_url: payload.recording || null,
      transcript_url: payload.transcript || null,
      gathered_context: gatheredContext,
      cost_info: {},
      called_at: payload.call_time || new Date().toISOString(),
    });

    if (insertError) {
      console.error('Failed to insert call_log:', insertError);
      // Don't fail the webhook — still update the lead
    }

    // --- Step 6: Update the lead ---
    const buildNotes = (): string => {
      const parts: string[] = [];
      if (lead.notes) parts.push(lead.notes);
      if (payload.outcome) parts.push(`Outcome: ${payload.outcome}`);
      if (payload.budget) parts.push(`Budget: ${payload.budget}`);
      if (payload.visit_date) parts.push(`Visit: ${payload.visit_date}`);
      if (payload.notes) parts.push(payload.notes);
      return parts.join(' | ');
    };

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'called',
        call_outcome: callOutcome,
        score: score,
        qualification: qualification,
        qual_data: gatheredContext,
        recording_url: payload.recording || null,
        transcript_url: payload.transcript || null,
        last_attempt_at: payload.call_time || new Date().toISOString(),
        retry_count: (lead.retry_count || 0) + 1,
        notes: buildNotes(),
        follow_up_date:
          payload.visit_date && payload.visit_date !== 'null'
            ? null // Let the team set the exact follow-up date
            : lead.follow_up_date,
      })
      .eq('id', lead.id);

    if (updateError) {
      console.error('Failed to update lead:', updateError);
    }

    return NextResponse.json({ success: true, lead_id: lead.id, score });
  } catch (error: any) {
    console.error('Error POST /api/webhook/call-result:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
