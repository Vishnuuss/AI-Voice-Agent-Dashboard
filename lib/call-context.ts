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
 * Everything here is defensive: unknown shapes yield nulls, never throws.
 */

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
  };
}

/** The jsonb blob we persist on call_logs.gathered_context and leads.qual_data. */
export function buildGatheredContext(signals: CallSignals, outcome: string): Record<string, any> {
  const context: Record<string, any> = { call_outcome: outcome };
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
