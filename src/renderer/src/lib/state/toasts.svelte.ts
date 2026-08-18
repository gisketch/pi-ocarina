/** How long a toast stays up.
 *
 *  A failure is read more slowly than a success: it usually names something,
 *  and the person has to decide whether to act. A question gets the same span
 *  for the same reason and is a tone of its own — it is not a failure, and
 *  borrowing the failure's colour to borrow its lifetime would say it was. */
const LIFETIME_MS = { ok: 6000, info: 6000, ask: 12000, error: 12000 } as const

/** How many are shown at once. Beyond this the oldest goes: a stack taller
 *  than the eye can take in is a stack nobody reads. */
const MAX_STACK = 4

export type ToastTone = keyof typeof LIFETIME_MS

/** Where a toast's `view` goes. Carried as data rather than a closure so a
 *  toast stays inspectable, and so the jump belongs to the one place that
 *  already knows how to make it. */
export interface ToastJump {
  workspaceId: string
  threadId: ThreadId
  title: string
}

export interface Toast {
  id: number
  tone: ToastTone
  text: string
  /** The single action offered on the right. */
  label?: 'view' | 'undo' | 'retry'
  jump?: ToastJump
  /** What `undo` or `retry` does. `view` is answered by the jump instead. */
  run?: () => void
}

export type ToastRequest = Omit<Toast, 'id'>

/** The bottom-right stack.
 *
 *  Toasts are for what the user cannot see. Anything happening in the thread
 *  they are looking at is reported in that thread, and saying it twice would
 *  train them to ignore the corner. */
class Toasts {
  items = $state.raw<Toast[]>([])

  #nextId = 1
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>()

  push(request: ToastRequest): number {
    const id = this.#nextId++
    const next = [...this.items, { ...request, id }]

    // Trimming before the timers are set keeps a dropped toast from firing a
    // dismiss for an id that is no longer on the stack.
    for (const dropped of next.slice(0, Math.max(0, next.length - MAX_STACK))) {
      this.#clear(dropped.id)
    }

    this.items = next.slice(-MAX_STACK)
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), LIFETIME_MS[request.tone]),
    )
    return id
  }

  dismiss(id: number): void {
    this.#clear(id)
    this.items = this.items.filter((toast) => toast.id !== id)
  }

  /** Empties the stack. Used by tests; the app never clears it wholesale. */
  reset(): void {
    for (const toast of this.items) this.#clear(toast.id)
    this.items = []
  }

  #clear(id: number): void {
    const timer = this.#timers.get(id)
    if (timer === undefined) return
    clearTimeout(timer)
    this.#timers.delete(id)
  }
}

export const toasts = new Toasts()

import type { ThreadId } from '../../../../shared/thread-id'