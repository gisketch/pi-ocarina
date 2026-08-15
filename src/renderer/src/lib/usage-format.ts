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

/** The whole segment, or an empty string for a thread that has not run a turn.
 *
 *  A thread reports its accounting the moment it opens, so "has not run a turn"
 *  arrives as zeros rather than as nothing at all. Both are treated the same:
 *  "0 tok · $0.00" reads as a measurement, and there is nothing yet to
 *  measure. */
export function formatUsage(usage?: { tokens: number; costUsd: number }): string {
  if (!usage) return ''
  if (usage.tokens === 0 && usage.costUsd === 0) return ''

  const parts = [formatTokens(usage.tokens), formatCost(usage.costUsd)].filter(
    (part) => part !== '',
  )
  return parts.join(' · ')
}

/** One decimal, but no trailing ".0" — "12k" reads better than "12.0k". */
function round1(value: number): string {
  return String(Math.round(value * 10) / 10)
}
