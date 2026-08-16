/** Which block the reader is pointing at, per thread.
 *
 *  Kept apart from the thread model on purpose: focus is where a person is
 *  looking, not something the backend said. A thread that streams a hundred
 *  new blocks must not move the ring, and reopening a thread must not lose it.
 *
 *  The element registry mirrors `columns.ts`: components register what they
 *  drew, and this module never queries the DOM by class or tag. */

import { type NavBlock, step } from '../blocks'
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

  clear(threadId: string): void {
    if (this.#focused[threadId] === undefined || this.#focused[threadId] === null) return
    this.set(threadId, null)
  }

  /** Moves the ring and takes the view with it. */
  move(threadId: string, list: NavBlock[], delta: number): void {
    const next = step(list, this.idOf(threadId), delta)
    if (next === null) return

    this.set(threadId, next)
    revealBlock(threadId, next)
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

    const target = body.scrollTop + (delta * body.clientHeight) / 2
    const origin = body.getBoundingClientRect().top - body.scrollTop

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
