/** How a model reads in the selector's rows. */

/** "200k ctx" — the design's compact context label. */
export function ctxLabel(contextWindow: number): string {
  if (contextWindow <= 0) return 'ctx ?'
  if (contextWindow >= 1_000_000) return `${Math.round(contextWindow / 100_000) / 10}M ctx`
  return `${Math.round(contextWindow / 1000)}k ctx`
}

/** `$`, `$$` or `$$$`, from dollars per million input tokens.
 *
 *  Coarse on purpose: the row is for choosing between models at a glance, and
 *  an exact price there would be read as a quote for the turn about to run. */
export function costTier(costPerMTok: number): string {
  if (costPerMTok <= 0) return 'free'
  if (costPerMTok < 1) return '$'
  if (costPerMTok < 5) return '$$'
  return '$$$'
}

/** The design's stepped pixel bars: four of them, `lit` up to `filled`.
 *
 *  `total` is how many steps the thing being drawn has, `filled` how many are
 *  lit. Called with one argument it lights a share proportional to the model's
 *  reasoning range, which is what the model rows show. */
export function reasoningBars(total: number, filled?: number): boolean[] {
  const BARS = 4
  const lit =
    filled === undefined
      ? Math.min(BARS, Math.max(total === 0 ? 0 : 1, Math.round((total / 7) * BARS)))
      : Math.min(BARS, Math.max(1, Math.ceil((filled / Math.max(1, total)) * BARS)))

  return Array.from({ length: BARS }, (_, index) => index < lit)
}
