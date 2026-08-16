/** Which block the reader is pointing at, per thread.
 *
 *  Kept apart from the thread model on purpose: focus is where a person is
 *  looking, not something the backend said. A thread that streams a hundred
 *  new blocks must not move the ring, and reopening a thread must not lose it.
 *
 *  The element registry mirrors `columns.ts`: components register what they
 *  drew, and this module never queries the DOM by class or tag. */

import { type NavBlock, step } from '../blocks'

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
