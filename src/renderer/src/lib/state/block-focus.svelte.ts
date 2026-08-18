/** Which block the reader is pointing at, per thread.
 *
 *  Kept apart from the thread model on purpose: focus is where a person is
 *  looking, not something the backend said. A thread that streams a hundred
 *  new blocks must not move the ring, and reopening a thread must not lose it.
 *
 *  The element registry mirrors `columns.ts`: components register what they
 *  drew, and this module never queries the DOM by class or tag. */

import { type NavBlock, step } from '../blocks'
import { columnBody, smoothScrollTo } from './columns'

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

/** Breathing room above a block brought to the top, so it does not sit welded
 *  to the edge of the column. */
const REVEAL_PAD = 10

/** Whether an element is drawn around a block rather than being one. */
const decorative = (el: Element): boolean =>
  (el as HTMLElement).dataset.navId === undefined && el.querySelector('[data-nav-id]') === null

/** Where a reveal aligns, which is above the block more often than not.
 *
 *  A message's name — YOU, or the agent's — is drawn above the first thing the
 *  ring can land on, and is not a block anyone can point at. Aligning the block
 *  puts that name just off the top, so the reader arrives at a paragraph with
 *  nobody attached to it.
 *
 *  So this walks up, and at every level takes in whatever sits immediately
 *  above and is not itself a block: the label inside a message, and the turn's
 *  name above it. It stops at the first sibling that is, or contains, another
 *  block — which is where this one stops being the top of anything. A second
 *  paragraph in a message keeps its own top, because the paragraph above it is
 *  a block in its own right.
 *
 *  A y coordinate rather than an element: the name above a turn is a sibling of
 *  the block's wrapper, not an ancestor of it, so there is no one element whose
 *  box is the answer. */
function revealTop(el: HTMLElement, body: HTMLElement): number {
  let node: HTMLElement = el
  let top = el.getBoundingClientRect().top

  for (;;) {
    let above = node.previousElementSibling
    while (above && decorative(above)) {
      top = Math.min(top, above.getBoundingClientRect().top)
      above = above.previousElementSibling
    }

    const parent = node.parentElement
    if (above || !parent || parent === body) return top
    node = parent
  }
}

/** Brings a block into view without moving the page more than it must.
 *
 *  `nearest` rather than `center`: a block already on screen should not jump,
 *  and walking a transcript with `j` should feel like a cursor moving down a
 *  page, not like the page reloading under the cursor. `start` is for paging,
 *  which is a deliberate move of the whole view.
 *
 *  Aligned by hand rather than by `scrollIntoView`, for two reasons: the browser
 *  aligns the element it was given and cannot be told to bring the name above it
 *  along, and its smooth scroll is its own duration, which is slower than a
 *  keyboard wants. */
export function revealBlock(threadId: string, navId: string, place: 'nearest' | 'start' = 'nearest'): void {
  const el = blockElement(threadId, navId)
  if (!el) return

  const body = columnBody(threadId)
  if (!body) {
    // A column that scrolls something other than DOM overflow. Nothing to
    // measure, so ask the browser for the old behaviour.
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    return
  }

  const box = body.getBoundingClientRect()
  const top = revealTop(el, body)
  const bottom = el.getBoundingClientRect().bottom
  const toTop = body.scrollTop + (top - box.top) - REVEAL_PAD

  if (place === 'start' || top < box.top + REVEAL_PAD) {
    smoothScrollTo(body, toTop)
    return
  }

  // Below the fold. Bringing the foot of the block up is enough — unless the
  // block is taller than the column, where that would push its head off the
  // top, and its head is the part being pointed at.
  if (bottom > box.bottom) {
    smoothScrollTo(body, Math.min(toTop, body.scrollTop + (bottom - box.bottom) + REVEAL_PAD))
  }
}

class BlockFocus {
  /** Keyed by thread id. Absent means "this reader has not started
   *  navigating", which is what keeps a fresh column undimmed. */
  #focused = $state<Record<string, string | null>>({})

  idOf(threadId: string): string | null {
    return this.#focused[threadId] ?? null
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
  const attach = (target: NavTarget): (() => void) => {
    if (target.navId === null) {
      // Leap trusts this attribute to say which block a text node is in, so an
      // element that has stopped being a destination must stop claiming to be.
      delete el.dataset.navId
      return NOOP
    }
    // Stamped as well as registered: leap walks up from a text node to find
    // which block it is in, and an attribute is the only way to ask the DOM
    // that question without holding the map upside down.
    el.dataset.navId = target.navId
    return registerBlock(target.threadId, target.navId, el)
  }

  let off = attach(ids)

  return {
    update(next) {
      off()
      off = attach(next)
    },
    destroy() {
      off()
      delete el.dataset.navId
    },
  }
}
