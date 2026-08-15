/** How the status bar writes pi's own accounting.
 *
 *  Nothing here estimates anything: the numbers arrive from pi's session stats
 *  and these functions only decide how many characters they get. The status bar
 *  is one line, so a token count reads as "12.4k" rather than "12,431". */

/** "834 tok" · "12.4k tok" · "1.2m tok". */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return ''
  if (tokens < 1000) return `${Math.round(tokens)} tok`
  if (tokens < 1_000_000) return `${round1(tokens / 1000)}k tok`
  return `${round1(tokens / 1_000_000)}m tok`
}

/** "$0.31". Cents matter here — a turn that cost nothing and a turn that cost
 *  three cents are different facts, and rounding to dollars would hide it. */
export function formatCost(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd < 0) return ''
  return `$${costUsd.toFixed(2)}`
}

/** The whole segment, or an empty string for a thread that has not run a turn
 *  yet. A zeroed "0 tok · $0.00" would look like a measurement rather than the
 *  absence of one. */
export function formatUsage(usage?: { tokens: number; costUsd: number }): string {
  if (!usage) return ''

  const parts = [formatTokens(usage.tokens), formatCost(usage.costUsd)].filter(
    (part) => part !== '',
  )
  return parts.join(' · ')
}

/** One decimal, but no trailing ".0" — "12k" reads better than "12.0k". */
function round1(value: number): string {
  return String(Math.round(value * 10) / 10)
}
