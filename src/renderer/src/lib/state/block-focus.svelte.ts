/** Which block the reader is pointing at, per thread.
 *
 *  Kept apart from the thread model on purpose: focus is where a person is
 *  looking, not something the backend said. A thread that streams a hundred
 *  new blocks must not move the ring, and reopening a thread must not lose it.
 *
 *  The element registry mirrors `columns.ts`: components register what they
 *  drew, and this module never queries the DOM by class or tag. */

import { type NavBlock, step } from '../blocks'
import { labelsFor, matchLabel } from '../leap'
import { columnBody } from './columns'

const elements = new Map<string, Map<string, HTMLElement>>()

/** Registers one rendered block. Returns an unregister function. */
export function registerBlock(threadId: string, navId: string, el: HTMLElement): () => void {
  let forThread = elements.get(threadId)
  if (!forThread) {
    forThread = new Map()
    elements.set(threadId, forThread)
  }
  forThread.set(navId, el)

  return () => {
    const current = elements.get(threadId)
    if (current?.get(navId) !== el) return
    current.delete(navId)
    if (current.size === 0) elements.delete(threadId)
  }
}

export function blockElement(threadId: string, navId: string): HTMLElement | undefined {
  return elements.get(threadId)?.get(navId)
}

/** Brings a block into view without moving the page more than it must.
 *
 *  `nearest` rather than `center`: a block already on screen should not jump,
 *  and walking a transcript with `j` should feel like a cursor moving down a
 *  page, not like the page reloading under the cursor. */
export function revealBlock(threadId: string, navId: string): void {
  blockElement(threadId, navId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** Hints on screen, waiting for the reader to name one. */
export interface Leap {
  threadId: string
  /** Nav id per label, same index. */
  ids: string[]
  labels: string[]
  /** What has been typed so far. */
  typed: string
}

class BlockFocus {
  /** Keyed by thread id. Absent means "this reader has not started
   *  navigating", which is what keeps a fresh column undimmed. */
  #focused = $state<Record<string, string | null>>({})

  /** Non-null only while hints are on screen. The whole mode is one object, so
   *  a component can ask "is this block labelled" without a second lookup. */
  leap = $state<Leap | null>(null)

  idOf(threadId: string): string | null {
    return this.#focused[threadId] ?? null
  }

  /** The label drawn on a block, or null when it has none. */
  labelOf(threadId: string, navId: string): string | null {
    const leap = this.leap
    if (leap === null || leap.threadId !== threadId) return null

    const at = leap.ids.indexOf(navId)
    if (at === -1) return null
    // A label the reader has already diverged from is not a destination any
    // more. Hiding it narrows the screen to what is still reachable.
    return leap.labels[at]?.startsWith(leap.typed) ? (leap.labels[at] ?? null) : null
  }

  set(threadId: string, navId: string | null): void {
    // `$state` on a plain object: assign a new one so readers of `idOf` for
    // other threads are not woken by a change that is not theirs.
    this.#focused = { ...this.#focused, [threadId]: navId }
  }

  /** Drops everything remembered about a thread whose column has gone. */
  forget(threadId: string): void {
    if (this.#focused[threadId] === undefined) return

    const next = { ...this.#focused }
    delete next[threadId]
    this.#focused = next
    if (this.leap?.threadId === threadId) this.leap = null
  }

  clear(threadId: string): void {
    if (this.#focused[threadId] === undefined || this.#focused[threadId] === null) return
    this.set(threadId, null)
  }

  /** Moves the ring and takes the view with it.
   *
   *  The first press starts where the reader is looking, not at the top of a
   *  thread they may have scrolled a long way down. */
  move(threadId: string, list: NavBlock[], delta: number): void {
    const current = this.idOf(threadId)
    const next = current === null ? this.#firstInView(threadId, list, delta) : step(list, current, delta)
    if (next === null) return

    this.set(threadId, next)
    revealBlock(threadId, next)
  }

  /** The blocks the reader can see, in order. */
  #visible(threadId: string, list: NavBlock[]): NavBlock[] {
    const body = columnBody(threadId)
    if (!body) return []

    const box = body.getBoundingClientRect()
    return list.filter((entry) => {
      const el = blockElement(threadId, entry.id)
      if (!el) return false

      const rect = el.getBoundingClientRect()
      return rect.bottom > box.top && rect.top < box.bottom
    })
  }

  /** Where the ring appears when there was not one. Moving down starts at the
   *  top of the view and moving up at the bottom of it, so the first press is
   *  always a small step from what the reader is already reading. A column
   *  that has not painted has nothing visible, and falls back to its end. */
  #firstInView(threadId: string, list: NavBlock[], delta: number): string | null {
    const seen = this.#visible(threadId, list)
    if (seen.length === 0) return step(list, null, delta)

    return (delta < 0 ? seen[seen.length - 1]?.id : seen[0]?.id) ?? null
  }

  /** `ctrl-d` and `ctrl-u`. Half a viewport, and the ring goes with the view.
   *
   *  There is one scroll, not two: the ring lands on the first block that would
   *  be at the new top, and revealing that block from `start` is what performs
   *  the move. Scrolling first and then revealing would fight itself, because
   *  a smooth scroll has not landed by the time the next rect is read. */
  page(threadId: string, list: NavBlock[], delta: number): void {
    const body = columnBody(threadId)
    if (!body || list.length === 0) {
      // A terminal column, or one that has not painted. One block is a
      // truthful answer to "page" when there is no page to measure.
      this.move(threadId, list, delta)
      return
    }

    const origin = body.getBoundingClientRect().top - body.scrollTop
    const half = (delta * body.clientHeight) / 2
    // Measured from the ring, not from `scrollTop`. A second press arriving
    // while the first smooth scroll is still travelling would otherwise page
    // from where the view happens to be mid-flight, and move less than a
    // screen for two presses.
    const from = blockElement(threadId, this.idOf(threadId) ?? '')
    const target = from ? from.getBoundingClientRect().top - origin + half : body.scrollTop + half

    let chosen: string | null = null
    let last: string | null = null
    for (const entry of list) {
      const el = blockElement(threadId, entry.id)
      if (!el) continue

      last = entry.id
      // Rounded to whole pixels: a sub-pixel top on the block already at the
      // target would otherwise read as "below it" and skip one.
      if (Math.round(el.getBoundingClientRect().top - origin) >= Math.round(target)) {
        chosen = entry.id
        break
      }
    }

    // Nothing below the target means the target is past the end. The last
    // block that was actually drawn is as far as paging can go.
    const next = chosen ?? last
    if (next === null) {
      this.move(threadId, list, delta)
      return
    }

    this.set(threadId, next)
    blockElement(threadId, next)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  /** Labels every block the reader can currently see.
   *
   *  Only what is on screen: a hint is a promise that the destination is in
   *  front of you, and labelling a block two thousand rows down would make the
   *  keystroke a jump rather than a leap. */
  startLeap(threadId: string, list: NavBlock[]): void {
    const ids = this.#visible(threadId, list).map((entry) => entry.id)

    // Nothing visible is not a mode worth entering: it would swallow the next
    // keystroke and then cancel itself.
    if (ids.length === 0) return

    this.leap = { threadId, ids, labels: labelsFor(ids.length), typed: '' }
  }

  /** One key against the labels on screen. */
  typeLeap(key: string): void {
    const leap = this.leap
    if (leap === null) return

    const typed = leap.typed + key.toLowerCase()
    const { hit, live } = matchLabel(leap.labels, typed)

    if (hit !== null) {
      const target = leap.ids[hit]
      this.leap = null
      if (target === undefined) return

      this.set(leap.threadId, target)
      revealBlock(leap.threadId, target)
      return
    }

    // A key no label can complete ends the mode and leaves the ring where it
    // was. Guessing at what was meant is worse than doing nothing.
    if (!live) {
      this.leap = null
      return
    }

    this.leap = { ...leap, typed }
  }

  cancelLeap(): void {
    this.leap = null
  }
}

export const blockFocus = new BlockFocus()

/** Svelte action: registers the element a block was drawn into.
 *
 *  An action rather than an `$effect` because the element is the input — the
 *  effect form would have to bind every wrapper into a variable, and there is
 *  one wrapper per block in a thread that can hold thousands. */
export interface NavTarget {
  threadId: string
  /** Null for an element that is drawn but cannot be pointed at — a nested
   *  subagent row. Registering it would give the focus ring a stop the reader
   *  has no way to see. */
  navId: string | null
}

const NOOP = (): void => {}

export function navTarget(
  el: HTMLElement,
  ids: NavTarget,
): { update: (next: NavTarget) => void; destroy: () => void } {
  const attach = (target: NavTarget): (() => void) =>
    target.navId === null ? NOOP : registerBlock(target.threadId, target.navId, el)

  let off = attach(ids)

  return {
    update(next) {
      off()
      off = attach(next)
    },
    destroy() {
      off()
    },
  }
}
