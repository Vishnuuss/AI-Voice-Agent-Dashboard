import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    
    const [leadsRes, callsRes] = await Promise.all([
      supabase.from('leads').select('created_at, qualification').gte('created_at', fourWeeksAgo.toISOString()),
      supabase.from('call_logs').select('created_at').gte('created_at', fourWeeksAgo.toISOString())
    ]);

    if (leadsRes.error) throw leadsRes.error;
    if (callsRes.error) throw callsRes.error;

    const weeks: Record<string, { leads: number; calls: number; qualified: number }> = {};
    
    // Group by week (e.g. week number or just string "Week X")
    // Simple implementation: bin by 7 days
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      weeks[`Week ${4 - i}`] = { leads: 0, calls: 0, qualified: 0 };
    }

    const getWeekKey = (dateStr: string) => {
      const d = new Date(dateStr);
      const diffTime = Math.abs(now.getTime() - d.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7) return 'Week 4';
      if (diffDays <= 14) return 'Week 3';
      if (diffDays <= 21) return 'Week 2';
      if (diffDays <= 28) return 'Week 1';
      return null;
    };

    for (const lead of leadsRes.data || []) {
      const wk = getWeekKey(lead.created_at);
      if (wk) {
        weeks[wk].leads++;
        if (lead.qualification === 'qualified') weeks[wk].qualified++;
      }
    }

    for (const call of callsRes.data || []) {
      const wk = getWeekKey(call.created_at);
      if (wk) {
        weeks[wk].calls++;
      }
    }

    const result = Object.entries(weeks).map(([week, stats]) => ({ week, ...stats }));

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('Error GET /api/reports/weekly:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
