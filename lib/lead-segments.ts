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

import { applyVerticalFilter, type Vertical } from '@/lib/verticals';

export type LeadSegment = 'new' | 'retry_pending' | 'follow_up' | 'follow_up_scheduled' | 'unreachable';

export const LEAD_SEGMENTS: { value: LeadSegment; label: string; description: string }[] = [
  { value: 'new', label: 'New', description: 'Never called yet' },
  { value: 'retry_pending', label: 'Retry pending', description: 'No answer last time — due for another try' },
  { value: 'follow_up', label: 'Follow-ups due now', description: 'Asked for a callback on a date that has arrived' },
  {
    value: 'follow_up_scheduled',
    label: 'Follow-ups — all scheduled',
    description: 'Every booked callback, including ones due on a later date',
  },
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
 *
 * `retryGapMinutes` (the AI Agent page's "Gap between retries" setting) holds
 * a retry_pending lead back from being re-selected until that many minutes
 * have passed since its last attempt - callers that don't pass it get no gap.
 *
 * `vertical` restricts the query to one business line. It is applied HERE, in
 * the shared function, rather than at the two call sites - if the launch route
 * and the segment-count route each applied it themselves they would eventually
 * drift, and the dialog would promise a number the launch could not deliver.
 * Null/undefined means "All", which is no filter at all.
 *
 * `maxRetries` (the AI Agent page's "Max retries" setting) is the HARD CEILING
 * on how many times one person is ever dialled. It is enforced here, on the
 * shared filter, because that is the one place every automatic path goes
 * through - so no campaign can dial a lead that has already had its quota, no
 * matter which layer asked for the call.
 *
 * It is applied ONLY to the two automatic segments, `new` and `retry_pending`.
 * `follow_up`/`follow_up_scheduled` are callbacks the customer ASKED for and
 * `unreachable` is a deliberate manual override - capping those would mean
 * refusing to ring someone back at the time they requested, which is a
 * different thing entirely from retrying a number that did not answer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadSegmentFilter(
  query: any,
  segment: LeadSegment,
  retryGapMinutes = 0,
  vertical?: Vertical | null,
  maxRetries?: number,
) {
  query = applyVerticalFilter(query, vertical ?? null);

  // A lead that has already been dialled its full quota is out of the automatic
  // rotation for good. `retry_count` is the count of DISTINCT calls placed (one
  // row per dograh_run_id), so `retry_count >= maxRetries` means the quota is spent.
  const capped = (q: any) =>
    Number.isFinite(maxRetries) ? q.lt('retry_count', Math.max(0, maxRetries as number)) : q;

  switch (segment) {
    case 'retry_pending': {
      let q = capped(query.eq('status', 'retry_pending'));
      if (retryGapMinutes > 0) {
        const cutoff = new Date(Date.now() - retryGapMinutes * 60_000).toISOString();
        // A lead with no last_attempt_at yet (should not happen for
        // retry_pending, but defensively) is treated as already past the gap.
        q = q.or(`last_attempt_at.is.null,last_attempt_at.lte.${cutoff}`);
      }
      return q;
    }
    case 'follow_up':
      return query.not('follow_up_date', 'is', null).lte('follow_up_date', new Date().toISOString()).neq('status', 'queued');
    /**
     * Every booked callback, whether or not its date has arrived.
     *
     * `follow_up` deliberately only offers callbacks that are DUE, because
     * ringing someone a week before the date they asked for is a good way to
     * lose them. But a client who can see "1 follow-up" in the sidebar and finds
     * "Follow-ups due now (0)" in the launch dialog concludes the product is
     * broken - which happened twice before this existed. So the early call is
     * offered explicitly, labelled, and chosen rather than stumbled into.
     */
    case 'follow_up_scheduled':
      return query.not('follow_up_date', 'is', null).neq('status', 'queued');
    case 'unreachable':
      return query.in('status', ['no_answer', 'unreachable']);
    case 'new':
    default:
      return capped(query.eq('status', 'new'));
  }
}

/** Human-readable description of what a segment means, for error messages. */
export function segmentNoEligibleLeadsMessage(segment: LeadSegment): string {
  const found = LEAD_SEGMENTS.find((s) => s.value === segment);
  return `No eligible leads found in the "${found?.label ?? segment}" segment.`;
}
