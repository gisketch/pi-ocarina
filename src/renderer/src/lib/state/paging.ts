/** What a page does to a column.
 *
 *  `ctrl-d` and `ctrl-u`, held apart from the key layer because it is a
 *  complete idea and not a small one: how far a page is, what it is measured
 *  against, and where the ring lands when the view moves under it.
 *
 *  Half the column, measured against a block on screen rather than against
 *  `scrollTop`. The two are not the same distance here. A transcript
 *  virtualizes, so the blocks above the fold are estimates until they are
 *  measured, and the browser's own scroll anchoring shifts `scrollTop` to hold
 *  the visible content still while those estimates are corrected — which is
 *  exactly the correction an absolute target overwrites. The result was a chord
 *  that moved a third of a page one press and three pages the next, and an up
 *  that no single down could undo.
 *
 *  Against a real element the arithmetic is honest: the block ends up half a
 *  column from where it was, whatever happened to the estimates above it, so a
 *  press up and a press down cancel exactly. */

import type { NavBlock } from '../blocks'
import { SCROLL_STEP } from '../keyboard'
import { blockElement, blockFocus } from './block-focus.svelte'
import { columnBody, scrollColumn, scrollRest, smoothScrollAiming } from './columns'
import { following } from './following.svelte'

/** How far a column with no height to halve moves instead — a shell, whose
 *  buffer belongs to xterm and is not DOM overflow. */
const PAGE_MULTIPLE = 5

/** Moves the view by half a column, and in READ carries the ring with it. */
export function pageColumn(
  threadId: string,
  list: NavBlock[],
  delta: number,
  ring: boolean,
): void {
  // Paging up is the reader taking the view — the act, named at its source,
  // never inferred from the scroll it causes. Paging down needs nothing:
  // reaching the bottom re-arms by position.
  if (delta < 0) following.of(threadId).take()
  const body = columnBody(threadId)
  if (!body) {
    scrollColumn(threadId, delta * SCROLL_STEP * PAGE_MULTIPLE)
    return
  }

  const page = (delta * body.clientHeight) / 2
  // What the view will actually cover. At the ends of a thread that is less
  // than a page, and the ring has to be told the same story as the scroll.
  const travel =
    Math.max(0, Math.min(body.scrollHeight - body.clientHeight, body.scrollTop + page)) -
    body.scrollTop

  const anchor = onScreen(threadId, list, body)
  if (!anchor) {
    // Nothing painted to measure against. A pixel target is all there is.
    scrollColumn(threadId, page)
    return
  }

  // Decided from the layout as it stands, before anything moves, so the band
  // travels in the same frame as the key. Set and never revealed: a ring that
  // scrolled would be a second scroll fighting this one, which is what the
  // ring paging this replaced did wrong.
  if (ring) landRing(threadId, list, body, travel, page, delta)

  const offset = (): number =>
    anchor.getBoundingClientRect().top - body.getBoundingClientRect().top
  // Where the anchor is headed once everything already asked for has landed, so
  // a second press adds a second half-column instead of half of one.
  const pending = scrollRest(body) - body.scrollTop
  const wanted = offset() - pending - travel

  smoothScrollAiming(body, () => body.scrollTop + (offset() - wanted))
}

/** The first block on screen: what a page is measured against. */
function onScreen(threadId: string, list: NavBlock[], body: HTMLElement): HTMLElement | null {
  const box = body.getBoundingClientRect()
  for (const entry of list) {
    const el = blockElement(threadId, entry.id)
    if (!el) continue

    const rect = el.getBoundingClientRect()
    if (rect.bottom > box.top && rect.top < box.bottom) return el
  }
  return null
}

/** Where the ring lands when the page moves under it.
 *
 *  The topmost block on screen once the scroll has travelled — the first whose
 *  head sits at or below where the top of the view is going. A block taller
 *  than the column has no head to find, so the ring takes the block covering
 *  that line, which is the block the reader was already inside.
 *
 *  At the ends, where the view cannot cover a whole page, it goes to the end it
 *  is heading for instead. Every editor does this: the cursor keeps moving once
 *  the window has stopped, so the chord always advances the reader in the
 *  direction they pressed. */
function landRing(
  threadId: string,
  list: NavBlock[],
  body: HTMLElement,
  travel: number,
  page: number,
  delta: number,
): void {
  if (list.length === 0) return

  if (Math.abs(travel) < Math.abs(page) - 1) {
    const end = delta > 0 ? list[list.length - 1] : list[0]
    blockFocus.set(threadId, end.id)
    return
  }

  const box = body.getBoundingClientRect()
  let covering: string | null = null
  for (const entry of list) {
    const el = blockElement(threadId, entry.id)
    if (!el) continue

    const rect = el.getBoundingClientRect()
    if (rect.top - box.top >= travel) {
      blockFocus.set(threadId, entry.id)
      return
    }
    if (rect.bottom - box.top > travel) covering = entry.id
  }

  if (covering !== null) blockFocus.set(threadId, covering)
}
