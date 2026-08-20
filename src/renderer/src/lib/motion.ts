/** How a column swap moves. A reorder used to teleport: the strip's slide is
 *  a CSS transition on one transform, but a `Shift-H`/`Shift-L` changes DOM
 *  order, which no transition covers — FLIP does. Duration is read at
 *  trigger time and honors the same motion-off switches as `--dur-strip`,
 *  so one toggle governs every strip movement. */

export const SWAP_MS = 280

export function swapDuration(): number {
  if (typeof document === 'undefined') return 0
  if (document.documentElement.dataset.motion === 'off') return 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  return SWAP_MS
}
