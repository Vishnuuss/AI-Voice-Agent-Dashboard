/**
 * Lead scoring and call-outcome classification.
 *
 * Extracted from the webhook handler, which had two behavioural bugs:
 *  1. it added a flat +10 "the call happened" to every payload, so a no-answer
 *     scored 10 and was labelled `not_qualified` instead of staying unscored;
 *  2. every delivery set the lead's status to `called`, so unanswered numbers
 *     were never eligible for a retry.
 */

export type CallOutcome =
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'voicemail'
  | 'cancelled';

const UNANSWERED: readonly CallOutcome[] = ['no_answer', 'busy', 'failed', 'voicemail', 'cancelled'];

/**
 * Dispositions that are not an exact match for any name we know, recognised by
 * what they CONTAIN.
 *
 * The exact-match switch below was silently wrong for anything outside its list:
 * an unrecognised disposition fell through to `completed`, so a `user_busy`, a
 * `dial_no_answer` or a `switched_off` was recorded as a real conversation. The
 * lead was then marked `called`, never retried, and never appeared under Busy or
 * Unreachable — which is exactly the symptom of leads going missing from those
 * lists. Worse, lib/billing-meter.ts already classified the SAME call by
 * substring, so one call could be "Connected" on screen and "never connected" in
 * billing at the same time. Both paths now share this function.
 *
 * Order matters: the first pattern that matches wins.
 */
const DISPOSITION_PATTERNS: [RegExp, CallOutcome][] = [
  // Must not be a bare /answer/ — that also matches "answered".
  [/no_+answer|noanswer|unanswered|no_+response|not_+answered|ring_*no_*answer|time(d)?_*out/, 'no_answer'],
  [/busy|congestion|engaged/, 'busy'],
  [/voice_*mail|answering_*machine|machine_*detect|\bamd\b/, 'voicemail'],
  [/cancel/, 'cancelled'],
  [
    // "declined" is deliberately absent: it reads as a telephony rejection but
    // can equally be a customer declining the offer, and classifying it as a
    // failure would put that person back in the retry queue to be called again.
    /fail|error|rejected|unreachable|not_+reachable|invalid_*number|switched_*off|out_*of_*service|no_*route|network_*error/,
    'failed',
  ],
];

/** Normalises the many spellings providers use ("no-answer", "NO_ANSWER", "noanswer"). */
export function normaliseOutcome(raw: unknown): CallOutcome {
  const value = String(raw ?? '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  switch (value) {
    case 'no_answer':
    case 'noanswer':
    case 'unanswered':
    case 'timeout':
      return 'no_answer';
    case 'busy':
      return 'busy';
    case 'failed':
    case 'error':
    case 'rejected':
    // Dograh reports a crashed call as `pipeline_error`. It used to fall through
    // to the default and be recorded as a completed conversation, so broken calls
    // were invisible in the dashboard and the lead was never retried.
    case 'pipeline_error':
    case 'pipeline_failure':
      return 'failed';
    // Dograh reports the outcome as `call_disposition`. A hangup by either side
    // means the call WAS answered, so it must not fall through to a retry state.
    case 'user_hangup':
    case 'bot_hangup':
    case 'answered':
      return 'completed';
    case 'voicemail':
    case 'machine':
    case 'answering_machine':
      return 'voicemail';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      break;
  }

  for (const [pattern, outcome] of DISPOSITION_PATTERNS) {
    if (pattern.test(value)) return outcome;
  }

  // Still unknown. `completed` stays the default because Dograh's own vocabulary
  // for a real conversation is open-ended — user_hangup, user_qualified,
  // user_not_qualified, user_speech are all connected calls — so anything that
  // does not look like a telephony failure is treated as one that happened.
  return 'completed';
}

export function isAnswered(outcome: CallOutcome): boolean {
  return !UNANSWERED.includes(outcome);
}

/**
 * Retry only makes sense for calls that never produced a conversation.
 *
 * `failed` is included because it covers our own breakages (a crashed pipeline,
 * a provider error) as well as telephony faults - in none of those cases did the
 * customer actually decline, so writing the lead off as unreachable after one
 * attempt loses a perfectly good number. MAX_RETRIES still caps the attempts.
 */
export function isRetryable(outcome: CallOutcome): boolean {
  return outcome === 'no_answer' || outcome === 'busy' || outcome === 'voicemail' || outcome === 'failed';
}

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s !== '' && s !== 'null' && s !== 'undefined' && s !== 'false' && s !== 'none' && s !== 'n/a';
}

/**
 * Words an agent returns when the caller never actually named a loan type.
 *
 * The extraction prompt says "…or unclear if they never named one", so `unclear`
 * arrives as a perfectly meaningful string and would otherwise score 100 — the
 * exact opposite of what it means. A lead who never said which loan they wanted
 * must score 50, not 100.
 */
const NON_ANSWERS = new Set([
  'unclear',
  'unknown',
  'not sure',
  'notsure',
  'dont know',
  "don't know",
  'none',
  'na',
  'n/a',
  'other',
  'any',
  'nothing',
  'no',
]);

/** True only when the caller named a real, actionable loan type. */
function isRealLoanType(value: unknown): boolean {
  if (!isMeaningful(value)) return false;
  return !NON_ANSWERS.has(String(value).trim().toLowerCase());
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'interested';
}

export interface ScoreInput {
  interested?: unknown;
  budget?: unknown;
  visit_date?: unknown;
  outcome?: unknown;
  duration?: unknown;
  /**
   * Loan-agent signals. The live Telugu workflow extracts loan_type / profession
   * rather than the real-estate visit_date, so scoring only on the old fields gave
   * every answered call a flat 10 and marked it `not_qualified`.
   */
  loan_type?: unknown;
  profession?: unknown;
  do_not_call?: unknown;
  /**
   * A score the agent worked out itself during the call, 0-100.
   *
   * The two-question loan agent scores on the call: 100 when the caller named a
   * loan type, 50 when they said they need a loan but never named one, 0 when
   * they said no. That verdict beats anything reconstructed here, because the
   * additive rules below assume a long call that collects budget, income and
   * occupation - questions this agent deliberately no longer asks. Without this,
   * a perfect "100" call would be re-scored down to about 60.
   */
  lead_score?: unknown;
}

export interface ScoreResult {
  score: number;
  qualification: 'qualified' | 'not_qualified' | null;
  outcome: CallOutcome;
  answered: boolean;
  durationSeconds: number;
  /**
   * Which method produced the score, so the dashboard can say who decided.
   *   rules  - computed here from the fields the agent extracted (the normal path)
   *   agent  - the agent's own number, used only when the rules have no signal
   *   none   - unanswered call, deliberately left unscored and retryable
   */
  scoredBy: 'rules' | 'agent' | 'none';
  /** Plain-English reason, shown in the UI. Never a template string. */
  reason: string;
}

export const QUALIFIED_THRESHOLD = 60;
/** Calls shorter than this were effectively not real conversations. */
const MIN_CONVERSATION_SECONDS = 10;

/**
 * The floor for someone who actually held a conversation.
 *
 * Zero is reserved for a real refusal - "no", "do not call", wrong number - and
 * for calls that never connected. A person who picked up, stayed on the line and
 * talked, but never got as far as naming a budget or a type, is NOT the same
 * lead as someone who said no: they answered, they engaged, and they are worth
 * another attempt. Scoring both of them 0 makes the two indistinguishable in the
 * dashboard and in any export the client works from.
 *
 * Deliberately well below QUALIFIED_THRESHOLD - this is "worth a second look",
 * never "qualified".
 */
export const ENGAGED_SCORE = 25;

export function scoreCall(input: ScoreInput): ScoreResult {
  const outcome = normaliseOutcome(input.outcome);
  const answered = isAnswered(outcome);

  const parsedDuration = Number(input.duration);
  const durationSeconds = Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.round(parsedDuration) : 0;

  // An unanswered call carries no signal about the lead - leave it unscored so it
  // stays eligible for retry rather than being written off as not_qualified.
  if (!answered) {
    return { score: 0, qualification: null, outcome, answered, durationSeconds, scoredBy: 'none', reason: `Not answered (${outcome.replace(/_/g, ' ')})` };
  }

  // An explicit do-not-call is a hard disqualification regardless of anything else.
  if (isTruthyFlag(input.do_not_call)) {
    return { score: 0, qualification: 'not_qualified', outcome, answered, durationSeconds, scoredBy: 'rules', reason: 'Asked not to be called again' };
  }

  // ── The loan ladder ─────────────────────────────────────────────────────
  //
  // Computed HERE from the fields the agent extracted, not taken from a number
  // the model typed out. The extraction is a yes/no or a single word, which
  // models get right; arithmetic in prose is what they get wrong. Deriving the
  // score makes it reproducible and explainable - the same call always yields
  // the same number, and the reason can be shown to the operator.
  //
  //   100  named a loan type      -> a real, actionable lead
  //    50  needs a loan, no type  -> worth a callback, not yet actionable
  //     0  said no                -> not a lead
  if (isRealLoanType(input.loan_type)) {
    const type = String(input.loan_type).trim();
    return { score: 100, qualification: 'qualified', outcome, answered, durationSeconds, scoredBy: 'rules', reason: `Named a loan type: ${type}` };
  }

  if (isTruthyFlag(input.interested)) {
    return { score: 50, qualification: 'not_qualified', outcome, answered, durationSeconds, scoredBy: 'rules', reason: 'Said they need a loan but did not name a type' };
  }

  // Interest was explicitly denied - a real "no", not merely a missing field.
  if (input.interested === false || String(input.interested ?? '').trim().toLowerCase() === 'false') {
    return { score: 0, qualification: 'not_qualified', outcome, answered, durationSeconds, scoredBy: 'rules', reason: 'Said they do not need a loan' };
  }

  // Nothing was extracted at all - the call connected but produced no answers.
  // Fall back to the agent's own number if it sent one, and only then to the
  // older additive rules, which need budget/income/occupation fields that the
  // two-question agent no longer collects.
  const agentScore = typeof input.lead_score === 'number' ? input.lead_score : Number(String(input.lead_score ?? '').trim());
  if (isMeaningful(input.lead_score) && Number.isFinite(agentScore) && agentScore >= 0 && agentScore <= 100) {
    return {
      score: Math.round(agentScore),
      qualification: agentScore >= QUALIFIED_THRESHOLD ? 'qualified' : 'not_qualified',
      outcome,
      answered,
      durationSeconds,
      scoredBy: 'agent',
      reason: `Agent scored the call ${Math.round(agentScore)} — no answers were extracted`,
    };
  }

  let score = 0;
  if (isTruthyFlag(input.interested)) score += 40;
  // Amount / budget is the strongest secondary signal in both workflows.
  if (isMeaningful(input.budget)) score += 20;
  // Either a loan type (loan workflow) or a visit date (property workflow) counts
  // as "the customer gave us a concrete requirement".
  if (isMeaningful(input.loan_type) || isMeaningful(input.visit_date)) score += 15;
  if (isMeaningful(input.profession)) score += 5;
  score += 10; // reached and completed the conversation
  if (durationSeconds >= MIN_CONVERSATION_SECONDS) score += 10;

  score = Math.max(0, Math.min(score, 100));

  // The engaged floor. Reaching here means the call connected and the caller
  // never refused - they simply did not answer the qualifying questions. That is
  // a warmer lead than a flat no, so it must not share the same score. Only
  // applied to calls long enough to have been a real conversation; a three-second
  // pickup-and-hangup stays where the arithmetic put it.
  if (durationSeconds >= MIN_CONVERSATION_SECONDS && score < ENGAGED_SCORE) {
    return {
      score: ENGAGED_SCORE,
      scoredBy: 'rules',
      reason: 'Talked but gave no usable answers — did not refuse, so worth another try',
      qualification: 'not_qualified',
      outcome,
      answered,
      durationSeconds,
    };
  }

  return {
    score,
    scoredBy: 'rules',
    reason: 'Connected, but the caller gave no usable answers',
    qualification: score >= QUALIFIED_THRESHOLD ? 'qualified' : 'not_qualified',
    outcome,
    answered,
    durationSeconds,
  };
}

/** Maps a call outcome to the lead status, keeping unanswered leads retryable. */
export function leadStatusFor(outcome: CallOutcome, retryCount: number, maxRetries: number): string {
  if (isAnswered(outcome)) return 'called';
  if (isRetryable(outcome) && retryCount < maxRetries) return 'retry_pending';
  return outcome === 'no_answer' ? 'no_answer' : 'unreachable';
}
