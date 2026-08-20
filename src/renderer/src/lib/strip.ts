/** Strip geometry — kept pure so the slide arithmetic is testable without a DOM.
 *  Values mirror the design reference (780px columns, 22px gap, COL step 802). */
export const COLUMN_WIDTH = 780
export const COLUMN_GAP = 22
export const COLUMN_STEP = COLUMN_WIDTH + COLUMN_GAP
export const ATTACHMENT_WIDTH = 390
export const ATTACHED_GROUP_WIDTH = COLUMN_WIDTH + ATTACHMENT_WIDTH
/** Breathing room between a revealed member and the viewport edge it is
 *  pushed against — flush against the glass reads as clipped, not focused. */
export const REVEAL_PADDING = 20
/** Below this the clamped reveal would pin the host to both viewport edges
 *  at once: the host itself plus its padding on both sides. */
export const REVEAL_MIN_WIDTH = COLUMN_WIDTH + 2 * REVEAL_PADDING

/** Pixel offset that centres the focused column inside a strip anchored at left:50%. */
export function stripOffset(focusedIndex: number): number {
  return -(COLUMN_WIDTH / 2 + focusedIndex * COLUMN_STEP)
}

/** How an attached group meets the viewport. Members never resize — the
 *  regime only picks how the group is placed:
 *  - full:   the whole group fits and centres as one entity.
 *  - reveal: the group keeps its width; the offset is clamped so the
 *            focused member is fully visible and the partner is clipped.
 *  - split:  the members separate into two ordinary columns with the strip
 *            gap, each centred alone when focused.
 *  An unmeasured viewport (0) reads as full so the first paint is centred. */
export type PaneRegime = 'full' | 'reveal' | 'split'

export function paneRegime(attached: boolean, viewportWidth: number): PaneRegime {
  if (!attached || viewportWidth <= 0 || viewportWidth >= ATTACHED_GROUP_WIDTH) return 'full'
  return viewportWidth >= REVEAL_MIN_WIDTH ? 'reveal' : 'split'
}

/** Width of one navigation entity. Constant per regime, never viewport-led:
 *  a member that resized would re-wrap a live terminal. */
export function paneGroupWidth(attached: boolean, regime: PaneRegime = 'full'): number {
  if (!attached) return COLUMN_WIDTH
  if (regime === 'split') return COLUMN_WIDTH + COLUMN_GAP + ATTACHMENT_WIDTH
  return ATTACHED_GROUP_WIDTH
}

export interface MemberBox {
  /** Group-local x of the member's left edge. */
  start: number
  width: number
}

/** Where the host and its attachment sit inside their group. Zero-gap while
 *  the group reads as one entity; the strip gap opens between them in split. */
export function memberBoxes(
  side: 'left' | 'right',
  regime: PaneRegime,
): { host: MemberBox; attachment: MemberBox } {
  const gap = regime === 'split' ? COLUMN_GAP : 0
  if (side === 'left') {
    return {
      attachment: { start: 0, width: ATTACHMENT_WIDTH },
      host: { start: ATTACHMENT_WIDTH + gap, width: COLUMN_WIDTH },
    }
  }
  return {
    host: { start: 0, width: COLUMN_WIDTH },
    attachment: { start: COLUMN_WIDTH + gap, width: ATTACHMENT_WIDTH },
  }
}

/** The strip offset for a focused member of the group starting at
 *  `groupStart` (strip-x of its left edge), against a strip anchored at
 *  left:50%. Full centres the group; split centres the member; reveal
 *  centres the group but clamps so the member's box stays inside the
 *  viewport with `REVEAL_PADDING` of air on the pushed edge — with the
 *  degenerate member-wider-than-viewport case falling back to centring the
 *  member, clipped evenly. */
export function paneOffset(
  groupStart: number,
  groupWidth: number,
  member: MemberBox,
  regime: PaneRegime,
  viewportWidth: number,
): number {
  const memberStart = groupStart + member.start
  if (regime === 'split') return -(memberStart + member.width / 2)
  const centered = -(groupStart + groupWidth / 2)
  if (regime === 'full') return centered
  const lo = -viewportWidth / 2 - memberStart + REVEAL_PADDING
  const hi = viewportWidth / 2 - (memberStart + member.width) - REVEAL_PADDING
  if (lo > hi) return -(memberStart + member.width / 2)
  return Math.min(hi, Math.max(lo, centered))
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
