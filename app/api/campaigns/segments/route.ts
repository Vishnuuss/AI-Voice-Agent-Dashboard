import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { applyLeadSegmentFilter, LEAD_SEGMENTS } from '@/lib/lead-segments';

/**
 * Live lead counts per launchable segment, for the Start Campaign dialog.
 *
 * Uses the exact same filter the launch route claims leads with
 * (lib/lead-segments.ts), so the number shown here is never out of step with
 * what a launch actually finds.
 */
export async function GET() {
  try {
    const supabase = createServerClient();

    const counts = await Promise.all(
      LEAD_SEGMENTS.map(async (segment) => {
        const { count, error } = await applyLeadSegmentFilter(
          supabase.from('leads').select('id', { count: 'exact', head: true }).not('phone', 'is', null),
          segment.value,
        );
        if (error) {
          console.error('[campaigns/segments] count failed for', segment.value, error);
          return { ...segment, count: 0 };
        }
        return { ...segment, count: count ?? 0 };
      }),
    );

    return NextResponse.json({ segments: counts });
  } catch (error: any) {
    console.error('[campaigns/segments] unexpected', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
