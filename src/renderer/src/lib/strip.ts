/** Strip geometry — kept pure so the slide arithmetic is testable without a DOM.
 *  Values mirror the design reference (780px columns, 22px gap, COL step 802). */
export const COLUMN_WIDTH = 780
export const COLUMN_GAP = 22
export const COLUMN_STEP = COLUMN_WIDTH + COLUMN_GAP
export const ATTACHED_GROUP_WIDTH = 1170
export const ATTACHED_GROUP_MIN_WIDTH = 960

/** Pixel offset that centres the focused column inside a strip anchored at left:50%. */
export function stripOffset(focusedIndex: number): number {
  return -(COLUMN_WIDTH / 2 + focusedIndex * COLUMN_STEP)
}

/** Width of one navigation entity. Narrow viewports swap between members
 *  instead of squeezing either below its usable minimum. */
export function paneGroupWidth(attached: boolean, viewportWidth: number): number {
  if (!attached) return COLUMN_WIDTH
  if (viewportWidth <= 0) return ATTACHED_GROUP_WIDTH
  if (viewportWidth < ATTACHED_GROUP_MIN_WIDTH) return COLUMN_WIDTH
  return Math.min(ATTACHED_GROUP_WIDTH, viewportWidth)
}

export function paneGroupIsNarrow(viewportWidth: number): boolean {
  return viewportWidth > 0 && viewportWidth < ATTACHED_GROUP_MIN_WIDTH
}

/** Centres a variable-width group in a strip anchored at left:50%. */
export function stripGroupOffset(widths: readonly number[], focusedIndex: number): number {
  if (widths.length === 0) return 0
  const index = Math.min(widths.length - 1, Math.max(0, focusedIndex))
  const before = widths.slice(0, index).reduce((total, width) => total + width, 0)
  return -(before + index * COLUMN_GAP + widths[index] / 2)
}

/** Clamp a thread index into a workspace of `count` threads. */
export function clampThread(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index))
}
