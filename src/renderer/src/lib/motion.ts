/** How a column swap moves. A reorder used to teleport: the strip's slide is
 *  a CSS transition on one transform, but a `Shift-H`/`Shift-L` changes DOM
 *  order, which no transition covers — FLIP does. Duration is read at
 *  trigger time and honors the same motion-off switches as `--dur-strip`,
 *  so one toggle governs every strip movement. */

export const SWAP_MS = 280

/** A fold opening or closing — an accordion's work, a group's members, a
 *  row's body. Shorter than a swap: a fold moves height in place, and 280ms
 *  of a forty-row turn unfolding reads as the app lagging. */
export const FOLD_MS = 180

function honored(ms: number): number {
  if (typeof document === 'undefined') return 0
  if (document.documentElement.dataset.motion === 'off') return 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  return ms
}

export function swapDuration(): number {
  return honored(SWAP_MS)
}

export function foldDuration(): number {
  return honored(FOLD_MS)
}
