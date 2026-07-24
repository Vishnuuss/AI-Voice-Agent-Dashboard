import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { dograh } from '@/lib/dograh';
import { WebhookPayload } from '@/types';

export async function POST(request: Request) {
  try {
    const secret = request.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaign_runs')
      .select('*')
      .eq('status', 'running');

    if (campaignError) {
      throw new Error('Failed to fetch running campaigns');
    }

    for (const campaign of campaigns || []) {
      try {
        const runs = await dograh.getCampaignRuns(campaign.dograh_campaign_id, 1, 100);
        let completedCount = 0;

        for (const run of runs.runs || []) {
          // Check if dograh_run_id exists
          const { data: existingLog } = await supabase
            .from('call_logs')
            .select('id')
            .eq('dograh_run_id', run.id)
            .single();

          if (!existingLog) {
            // Reconcile logic - pseudo webhook payload
            // Assuming Dograh run object has similar fields or we map them
            const payload = {
              run_id: run.id,
              status: run.status,
              phone_number: run.phone_number,
              duration: run.duration,
              recording_url: run.recording_url,
              transcript_url: run.transcript_url,
              gathered_context: run.gathered_context,
              summary: run.summary,
              metadata: run.metadata
            } as any; // Cast as any or WebhookPayload depending on exact types

            // Process like webhook
            let leadId = payload.metadata?.lead_id;
            let lead;

            if (leadId) {
              const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
              lead = data;
            } else if (payload.phone_number) {
              const { data } = await supabase.from('leads').select('*').eq('phone', payload.phone_number).single();
              lead = data;
            }

            if (lead) {
              leadId = lead.id;
              let score = 0;
              const context = payload.gathered_context || {};
              
              if (context.interested === true || context.interested === 'true') score += 40;
              if (context.budget_confirmed === true || context.budget_confirmed === 'true') score += 20;
              if (context.visit_date) score += 20;
              if (payload.status === 'completed') score += 10;
              if (payload.duration && payload.duration > 0) score += 10;
              score = Math.min(score, 100);

              const qualification = score >= 60 ? 'qualified' : (score > 0 ? 'unqualified' : lead.qualification);

              await supabase.from('call_logs').insert({
                lead_id: leadId,
                dograh_run_id: payload.run_id,
                direction: 'outbound',
                outcome: payload.status,
                duration: payload.duration,
                recording_url: payload.recording_url,
                transcript_url: payload.transcript_url,
                gathered_data: context
              });

              await supabase.from('leads').update({
                status: 'called',
                call_outcome: payload.status,
                score,
                qualification,
                qual_data: context,
                recording_url: payload.recording_url,
                transcript_url: payload.transcript_url,
                last_attempt_at: new Date().toISOString(),
                notes: payload.summary || lead.notes
              }).eq('id', leadId);
            }
          }

          if (run.status === 'completed' || run.status === 'failed' || run.status === 'no_answer') {
            completedCount++;
          }
        }
        
        // If dograh says campaign is completed, update our status
        const progress = await dograh.getCampaignProgress(campaign.dograh_campaign_id);
        if (progress.state === 'completed' || progress.state === 'finished') {
           await supabase.from('campaign_runs').update({ status: 'completed' }).eq('id', campaign.id);
        }
      } catch (err) {
        console.error(`Error reconciling campaign ${campaign.id}:`, err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error POST /api/cron/reconcile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
