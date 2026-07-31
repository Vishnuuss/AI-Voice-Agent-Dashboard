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
      return 'completed';
  }
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
}

export interface ScoreResult {
  score: number;
  qualification: 'qualified' | 'not_qualified' | null;
  outcome: CallOutcome;
  answered: boolean;
  durationSeconds: number;
}

export const QUALIFIED_THRESHOLD = 60;
/** Calls shorter than this were effectively not real conversations. */
const MIN_CONVERSATION_SECONDS = 10;

export function scoreCall(input: ScoreInput): ScoreResult {
  const outcome = normaliseOutcome(input.outcome);
  const answered = isAnswered(outcome);

  const parsedDuration = Number(input.duration);
  const durationSeconds = Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.round(parsedDuration) : 0;

  // An unanswered call carries no signal about the lead - leave it unscored so it
  // stays eligible for retry rather than being written off as not_qualified.
  if (!answered) {
    return { score: 0, qualification: null, outcome, answered, durationSeconds };
  }

  // An explicit do-not-call is a hard disqualification regardless of anything else.
  if (isTruthyFlag(input.do_not_call)) {
    return { score: 0, qualification: 'not_qualified', outcome, answered, durationSeconds };
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

  return {
    score,
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
