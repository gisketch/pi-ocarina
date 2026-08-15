/** Strip geometry — kept pure so the slide arithmetic is testable without a DOM.
 *  Values mirror the design reference (780px columns, 22px gap, COL step 802). */
export const COLUMN_WIDTH = 780
export const COLUMN_GAP = 22
export const COLUMN_STEP = COLUMN_WIDTH + COLUMN_GAP

/** Pixel offset that centres the focused column inside a strip anchored at left:50%. */
export function stripOffset(focusedIndex: number): number {
  return -(COLUMN_WIDTH / 2 + focusedIndex * COLUMN_STEP)
}

/** Clamp a thread index into a workspace of `count` threads. */
export function clampThread(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index))
}
