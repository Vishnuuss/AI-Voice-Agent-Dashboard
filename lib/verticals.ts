/**
 * The four business lines the voice agents sell for.
 *
 * Each vertical gets its own Dograh workflow, and each workflow extracts a
 * `vertical` variable naming itself. That is what lets the dashboard say
 * "score 100 from loan" rather than just "score 100" - once solar, real estate
 * and investing agents exist, a single lead list holds all four and the score
 * alone would be ambiguous.
 *
 * Only `loan` has a built agent today (Dograh workflow 3). The other three are
 * defined here so the dashboard already shows the categories, and so adding an
 * agent later is a workflow change rather than a code change.
 */

export const VERTICALS = ['loan', 'solar', 'realestate', 'investing'] as const;

export type Vertical = (typeof VERTICALS)[number];

export const DEFAULT_VERTICAL: Vertical = 'loan';

export const VERTICAL_LABELS: Record<Vertical, string> = {
  loan: 'Loan',
  solar: 'Solar',
  realestate: 'Real Estate',
  investing: 'Investing',
};

/** Tailwind classes per vertical, so a lead's business line is readable at a glance. */
export const VERTICAL_STYLES: Record<Vertical, { color: string; bg: string }> = {
  loan: { color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  solar: { color: 'text-amber-500', bg: 'bg-amber-500/10' },
  realestate: { color: 'text-sky-500', bg: 'bg-sky-500/10' },
  investing: { color: 'text-violet-500', bg: 'bg-violet-500/10' },
};

/**
 * Accepts whatever the agent, the CRM or a human typed and returns a known
 * vertical. Agents are configured by hand in the Dograh dashboard, so the value
 * arrives as free text - "Real Estate", "real-estate" and "property" all mean
 * the same thing. Returns null rather than guessing when nothing matches, so the
 * caller decides whether to fall back to the default.
 */
export function parseVertical(value: unknown): Vertical | null {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (!s) return null;

  if (s === 'loan' || s === 'loans' || s === 'finance' || s === 'lending') return 'loan';
  if (s === 'solar' || s === 'solarpanel' || s === 'solarpanels' || s === 'energy') return 'solar';
  if (s === 'realestate' || s === 'property' || s === 'realty' || s === 'housing') return 'realestate';
  if (s === 'investing' || s === 'investment' || s === 'investments' || s === 'wealth' || s === 'mutualfunds') return 'investing';
  return null;
}

export function verticalLabel(value: unknown): string {
  const v = parseVertical(value);
  return v ? VERTICAL_LABELS[v] : VERTICAL_LABELS[DEFAULT_VERTICAL];
}
