/**
 * Maps whatever Dograh sends into the small set of signals we score and store.
 *
 * Two things made this necessary:
 *  1. The live workflow ("BS Financial Services — Telugu Loan Agent") extracts
 *     loan_required / loan_type / loan_amount / profession / qualified / summary,
 *     while the webhook handler only understood the older real-estate field names
 *     (interested / budget / visit_date). Every answered call therefore scored a
 *     flat 10 and was written off as not_qualified with an empty budget.
 *  2. Depending on the delivery path the values arrive either flat on the payload,
 *     or nested under gathered_context / extracted_variables / variables / context.
 *
 * As of the two-question agent the workflow also sends `lead_score` (its own
 * 100/50/0 verdict) and `vertical` (which business line the call was for).
 *
 * Everything here is defensive: unknown shapes yield nulls, never throws.
 */

import { DEFAULT_VERTICAL, parseVertical } from '@/lib/verticals';

/** Values a Jinja template produces for a variable that did not resolve. */
const PLACEHOLDER_VALUES = new Set(['', 'none', 'null', 'undefined', 'nan', 'n/a', '{}', '[]', '-']);

/** "" / "None" / "Undefined" -> null; otherwise the trimmed string. */
export function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value);
      return s === '{}' || s === '[]' ? null : s;
    } catch {
      return null;
    }
  }
  const s = String(value).trim();
  return PLACEHOLDER_VALUES.has(s.toLowerCase()) ? null : s;
}

/** Accepts 6, "6" or "" and returns a number or null - never NaN. */
export function cleanNumber(value: unknown): number | null {
  const s = cleanString(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Jinja renders Python's True/False capitalised, and an unset variable as "".
 * Anything unrecognised stays null so scoreCall() treats it as "no signal"
 * rather than a definite "not interested".
 */
export function cleanBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const s = cleanString(value);
  if (s === null) return null;
  const v = s.toLowerCase();
  if (['true', 'yes', '1', 'interested', 'y', 'కావాలి', 'అవును'].includes(v)) return true;
  if (['false', 'no', '0', 'not_interested', 'n', 'వద్దు', 'లేదు'].includes(v)) return false;
  return null;
}

/** Nested places providers stash extracted variables. Later sources never win over earlier ones. */
const CONTEXT_KEYS = [
  'gathered_context',
  'extracted_variables',
  'extracted_context',
  'variables',
  'context',
  'collected_data',
  'gathered_data',
  'metadata',
  'initial_context',
];

/**
 * Flattens the payload and every nested context bag into one lookup table.
 * Top-level keys win; nested bags fill the gaps in the order listed above.
 */
export function flattenPayload(raw: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = {};

  const absorb = (obj: unknown) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (flat[key] === undefined) flat[key] = value;
    }
  };

  absorb(raw);
  for (const key of CONTEXT_KEYS) absorb(raw?.[key]);
  // One extra level: gathered_context.extracted_variables etc.
  for (const key of CONTEXT_KEYS) {
    const bag = raw?.[key];
    if (bag && typeof bag === 'object') for (const inner of CONTEXT_KEYS) absorb(bag[inner]);
  }

  return flat;
}

/** First non-null alias, in priority order. */
function pick(flat: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    if (flat[key] !== undefined && cleanString(flat[key]) !== null) return flat[key];
  }
  return null;
}

export interface CallSignals {
  interested: boolean | null;
  budget: string | null;
  loan_type: string | null;
  profession: string | null;
  monthly_income: string | null;
  existing_emi: string | null;
  visit_date: string | null;
  customer_intent: string | null;
  do_not_call: boolean | null;
  summary: string | null;
  notes: string | null;
  customer_name: string | null;
  /** The agent's own qualified flag, used as a fallback interest signal. */
  qualified_flag: boolean | null;
  /** Score the agent decided during the call, 0-100. Overrides the additive rules. */
  lead_score: string | null;
  /**
   * Which business line the call was for: loan, solar, realestate, investing.
   * Each vertical gets its own Dograh workflow, and each names itself here, so a
   * single lead list can hold all four and a score is never ambiguous.
   */
  vertical: string | null;
}

/**
 * The live Dograh webhook packs four extracted variables into one `notes` string:
 *   "type: Home loan | occupation: Salaried | income: 50000 | existing EMI: 12000"
 * Recovering them here means the dashboard shows structured values even before
 * the Dograh payload template is updated to send them as separate fields.
 */
function parsePackedNotes(notes: string | null): Record<string, string> {
  if (!notes || !notes.includes(':')) return {};
  const found: Record<string, string> = {};
  const aliases: Record<string, string> = {
    type: 'loan_type',
    'loan type': 'loan_type',
    occupation: 'occupation',
    profession: 'occupation',
    income: 'monthly_income',
    'monthly income': 'monthly_income',
    'existing emi': 'existing_emi',
    emi: 'existing_emi',
    amount: 'loan_amount',
  };

  for (const part of notes.split('|')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const label = part.slice(0, idx).trim().toLowerCase();
    const value = cleanString(part.slice(idx + 1));
    const key = aliases[label];
    if (key && value) found[key] = value;
  }
  return found;
}

/**
 * True for "type: | occupation: | income: | existing EMI:" - every segment is a
 * label with nothing after the colon, which is what the template renders when a
 * call was never answered and no variable resolved.
 */
function isEmptyLabelledList(text: string): boolean {
  const segments = text.split('|');
  if (segments.length < 2) return false;
  return segments.every((segment) => {
    const idx = segment.indexOf(':');
    return idx > 0 && segment.slice(idx + 1).trim() === '';
  });
}

export function extractCallSignals(raw: Record<string, any>): CallSignals {
  const flat = flattenPayload(raw ?? {});

  // Fill only the gaps: a real field always beats one recovered from the string.
  const rawNotes = cleanString(flat.notes);
  const packed = parsePackedNotes(rawNotes);
  for (const [key, value] of Object.entries(packed)) {
    if (flat[key] === undefined || cleanString(flat[key]) === null) flat[key] = value;
  }

  // The template always renders its notes line, so an unanswered call produces
  // "type:  | occupation:  | income:  | existing EMI:" - pure noise that was
  // being written into call_logs and appended to the lead's notes.
  if (rawNotes && Object.keys(packed).length === 0 && isEmptyLabelledList(rawNotes)) {
    flat.notes = null;
  }

  const interested = cleanBoolean(
    pick(flat, ['interested', 'loan_required', 'is_interested', 'lead_interested']),
  );
  const qualifiedFlag = cleanBoolean(pick(flat, ['qualified', 'is_qualified']));

  return {
    // Fall back to the agent's own "qualified" verdict when it never set an
    // explicit interest flag - otherwise a good call reads as "no signal".
    interested: interested ?? qualifiedFlag,
    budget: cleanString(pick(flat, ['budget', 'loan_amount', 'amount', 'requested_amount', 'loan_budget'])),
    loan_type: cleanString(pick(flat, ['loan_type', 'loan_category', 'product', 'property_type'])),
    profession: cleanString(pick(flat, ['profession', 'occupation', 'income_type', 'employment_type'])),
    monthly_income: cleanString(pick(flat, ['monthly_income', 'income', 'salary'])),
    existing_emi: cleanString(pick(flat, ['existing_emi', 'current_emi', 'emi'])),
    visit_date: cleanString(pick(flat, ['visit_date', 'preferred_visit_date', 'callback_date', 'follow_up_date'])),
    customer_intent: cleanString(pick(flat, ['customer_intent', 'intent', 'disposition'])),
    do_not_call: cleanBoolean(pick(flat, ['do_not_call', 'dnc', 'opt_out'])),
    summary: cleanString(pick(flat, ['summary', 'call_summary', 'crm_summary'])),
    notes: cleanString(pick(flat, ['notes', 'note', 'remarks', 'comments'])),
    customer_name: cleanString(pick(flat, ['customer_name', 'name', 'lead_name'])),
    qualified_flag: qualifiedFlag,
    lead_score: cleanString(pick(flat, ['lead_score', 'score', 'call_score'])),
    vertical: parseVertical(pick(flat, ['vertical', 'business_line', 'product_line', 'agent_type'])) ?? DEFAULT_VERTICAL,
  };
}

/**
 * True when the call actually told us something about the lead.
 *
 * A call can be "answered" and still carry no information - the customer picks up
 * and hangs up after three seconds, so nothing is extracted. Without this check a
 * throwaway second call overwrote a lead that an earlier real conversation had
 * qualified (observed live: score 75 "qualified" replaced by 20 "not_qualified").
 */
export function hasQualificationSignal(signals: CallSignals): boolean {
  return Boolean(
    signals.interested !== null ||
      signals.budget ||
      signals.loan_type ||
      signals.profession ||
      signals.monthly_income ||
      signals.existing_emi ||
      signals.visit_date ||
      signals.do_not_call !== null,
  );
}

export interface QaVerdict {
  tags: { tag: string; reason?: string }[];
  sentiment: string | null;
  score: number | null;
  summary: string | null;
}

/**
 * Dograh's QA node reviews each call against a rubric and returns tags such as
 * DEAD_AIR, HEARING_ISSUES, READ_OPTION_LIST or GUESSED_MISHEARD. The verdict
 * arrives either as the webhook's `qa` field or as `annotations` on the run
 * record, nested one level per QA node id, so flatten it into one shape.
 */
export function extractQaVerdict(raw: unknown): QaVerdict | null {
  if (!raw) return null;

  let payload: any = raw;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (typeof payload !== 'object') return null;

  // Results are keyed by node ("qa_6": {...}); merge every node's verdict.
  const blocks: any[] = [];
  if (Array.isArray(payload.tags) || payload.call_quality_score !== undefined) blocks.push(payload);
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith('qa_') && value && typeof value === 'object') blocks.push(value);
    if (key === 'node_results' && value && typeof value === 'object') {
      for (const inner of Object.values(value as Record<string, any>)) blocks.push(inner);
    }
  }
  if (blocks.length === 0) return null;

  // Dograh repeats each tag at the top level as an aggregate AND inside its node
  // block, so collapse by name and keep whichever copy carries the reason.
  const byTag = new Map<string, { tag: string; reason?: string }>();
  let sentiment: string | null = null;
  let score: number | null = null;
  let summary: string | null = null;

  const addTag = (tag: string, reason?: string) => {
    const existing = byTag.get(tag);
    if (!existing) byTag.set(tag, reason ? { tag, reason } : { tag });
    else if (!existing.reason && reason) existing.reason = reason;
  };

  for (const block of blocks) {
    for (const entry of block?.tags ?? []) {
      if (typeof entry === 'string') addTag(entry);
      else if (entry?.tag) addTag(String(entry.tag), cleanString(entry.reason) ?? undefined);
    }
    sentiment = sentiment ?? cleanString(block?.overall_sentiment);
    const parsed = cleanNumber(block?.call_quality_score);
    if (score === null && parsed !== null) score = parsed;
    summary = summary ?? cleanString(block?.summary);
  }

  const tags = [...byTag.values()];
  if (tags.length === 0 && score === null && !summary) return null;
  return { tags, sentiment, score, summary };
}

/**
 * The jsonb blob we persist on call_logs.gathered_context and leads.qual_data.
 *
 * `scoring` is included so the dashboard can show WHO decided the score and why,
 * rather than presenting a bare number nobody can audit.
 */
export function buildGatheredContext(
  signals: CallSignals,
  outcome: string,
  scoring?: { score: number; scoredBy: string; reason: string },
): Record<string, any> {
  const context: Record<string, any> = { call_outcome: outcome };
  if (scoring) {
    context.scoring = { score: scoring.score, scored_by: scoring.scoredBy, reason: scoring.reason };
  }
  if (signals.interested !== null) context.interested = signals.interested;
  if (signals.budget) context.loan_amount = signals.budget;
  if (signals.budget) context.budget_confirmed = signals.budget;
  if (signals.loan_type) context.loan_type = signals.loan_type;
  if (signals.profession) context.profession = signals.profession;
  if (signals.monthly_income) context.monthly_income = signals.monthly_income;
  if (signals.existing_emi) context.existing_emi = signals.existing_emi;
  if (signals.visit_date) context.preferred_visit_date = signals.visit_date;
  if (signals.customer_intent) context.customer_intent = signals.customer_intent;
  if (signals.do_not_call !== null) context.do_not_call = signals.do_not_call;
  if (signals.summary) context.summary = signals.summary;
  if (signals.notes) context.call_notes = signals.notes;
  if (signals.qualified_flag !== null) context.agent_qualified = signals.qualified_flag;
  // Always stored: the dashboard shows "100 from loan", so the business line has
  // to travel with the score even when every other field came back empty.
  context.vertical = signals.vertical ?? DEFAULT_VERTICAL;
  if (signals.lead_score) context.agent_lead_score = signals.lead_score;
  return context;
}

/** Human-readable one-liner appended to leads.notes for each attempt. */
export function buildNoteLine(
  signals: CallSignals,
  parts: { prefix: string; attempt: number; outcome: string; score: number | null },
): string {
  return [
    parts.prefix,
    `attempt ${parts.attempt}`,
    `outcome: ${parts.outcome}`,
    parts.score !== null ? `score: ${parts.score}` : null,
    signals.loan_type ? `loan: ${signals.loan_type}` : null,
    signals.budget ? `amount: ${signals.budget}` : null,
    signals.profession ? `profession: ${signals.profession}` : null,
    signals.visit_date ? `follow-up: ${signals.visit_date}` : null,
    signals.summary ?? signals.notes ?? null,
  ]
    .filter(Boolean)
    .join(' | ');
}

/**
 * Only absolute http(s) links are usable by the dashboard.
 *
 * Dograh stores raw storage keys like "transcripts/23.txt" / "recordings/23.wav"
 * on the run record, and only exposes a fetchable link once a public access token
 * exists. Storing a bare key produced an audio player pointed at nothing and a
 * transcript link that 404'd, so treat anything non-absolute as "not available".
 */
export function usableMediaUrl(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : null;
}

/** A visit/callback date only becomes leads.follow_up_date if it parses to a real date. */
export function parseFollowUpDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Ignore anything absurd (a mis-extracted "2" becoming year 2001, etc).
  const year = parsed.getUTCFullYear();
  if (year < 2020 || year > 2100) return null;
  return parsed.toISOString();
}
