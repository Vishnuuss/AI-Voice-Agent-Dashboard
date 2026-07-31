/**
 * The lead groupings a campaign can target, and the exact `leads` table filter
 * behind each one. Used by both the campaign launch route (to select and claim
 * leads) and the segment-counts route (to show live numbers in the launch
 * dialog) - one definition, so the count shown is always what actually launches.
 *
 * Grounded in the real status vocabulary the scoring code produces
 * (lib/call-scoring.ts leadStatusFor): new -> queued -> called, or
 * new -> queued -> retry_pending (auto-retried) -> no_answer/unreachable
 * (retries exhausted). follow_up is orthogonal to status - it is set whenever
 * a call captures a callback date, regardless of how the lead's status ends up.
 */

export type LeadSegment = 'new' | 'retry_pending' | 'follow_up' | 'unreachable';

export const LEAD_SEGMENTS: { value: LeadSegment; label: string; description: string }[] = [
  { value: 'new', label: 'New', description: 'Never called yet' },
  { value: 'retry_pending', label: 'Retry pending', description: 'No answer last time — due for another try' },
  { value: 'follow_up', label: 'Follow-ups due', description: 'Asked for a callback on a date that has arrived' },
  { value: 'unreachable', label: 'Unreachable', description: 'Gave up after repeated no-answers — manual retry only' },
];

export function isValidLeadSegment(value: unknown): value is LeadSegment {
  return typeof value === 'string' && LEAD_SEGMENTS.some((s) => s.value === value);
}

/**
 * Applies a segment's eligibility filter to a `leads` query. Used identically
 * for both counting candidates and selecting them for a campaign, so the
 * number shown in the dialog always matches what the launch actually claims.
 *
 * `queued` is always excluded: a lead already locked into another campaign is
 * never eligible, regardless of segment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadSegmentFilter(query: any, segment: LeadSegment) {
  switch (segment) {
    case 'retry_pending':
      return query.eq('status', 'retry_pending');
    case 'follow_up':
      return query.not('follow_up_date', 'is', null).lte('follow_up_date', new Date().toISOString()).neq('status', 'queued');
    case 'unreachable':
      return query.in('status', ['no_answer', 'unreachable']);
    case 'new':
    default:
      return query.eq('status', 'new');
  }
}

/** Human-readable description of what a segment means, for error messages. */
export function segmentNoEligibleLeadsMessage(segment: LeadSegment): string {
  const found = LEAD_SEGMENTS.find((s) => s.value === segment);
  return `No eligible leads found in the "${found?.label ?? segment}" segment.`;
}
