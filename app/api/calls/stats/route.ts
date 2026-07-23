import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data: calls, error } = await supabase
      .from('call_logs')
      .select('outcome, duration');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = calls.length;
    let connected = 0;
    let missed = 0;
    let totalDuration = 0;

    for (const call of calls) {
      if (call.outcome === 'completed') connected++;
      if (call.outcome === 'no_answer' || call.outcome === 'busy' || call.outcome === 'failed') missed++;
      if (call.duration) totalDuration += call.duration;
    }

    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

    return NextResponse.json({
      total,
      connected,
      missed,
      avgDuration
    });
  } catch (error: any) {
    console.error('Error GET /api/calls/stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
