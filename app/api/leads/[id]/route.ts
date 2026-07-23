import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .single();

    if (leadError) {
      console.error('Error fetching lead:', leadError);
      return NextResponse.json({ error: leadError.message }, { status: leadError.code === 'PGRST116' ? 404 : 500 });
    }

    const { data: callHistory, error: callsError } = await supabase
      .from('call_logs')
      .select('*')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false });

    if (callsError) {
      console.error('Error fetching call history:', callsError);
      return NextResponse.json({ error: callsError.message }, { status: 500 });
    }

    return NextResponse.json({
      lead,
      callHistory: callHistory || []
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
