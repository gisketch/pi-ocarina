import type { UiEvent } from '../../shared/protocol'

/** Tracks text queued into a running turn.
 *
 *  pi reports the queue's *contents* on every change, never its transitions, so
 *  a steer that has been handed to the agent is recognised by noticing it is no
 *  longer in the queue. Without that the UI would show it as pending forever. */
export class SteerQueue {
  #queued = new Map<string, Map<string, string>>()
  #counter = 0

  readonly #emit: (threadId: string, event: UiEvent) => void

  constructor(emit: (threadId: string, event: UiEvent) => void) {
    this.#emit = emit
  }

  /** Records a steer and announces it as pending. */
  add(threadId: string, text: string): string {
    this.#counter += 1
    const steerId = `steer-${this.#counter}`

    const queue = this.#queued.get(threadId) ?? new Map<string, string>()
    queue.set(text, steerId)
    this.#queued.set(threadId, queue)

    this.#emit(threadId, { kind: 'steer-queued', id: steerId, text })
    return steerId
  }

  /** Compares pi's queue against what is still marked pending. */
  sync(threadId: string, steering: readonly string[]): void {
    const queue = this.#queued.get(threadId)
    if (!queue) return

    for (const [text, steerId] of [...queue]) {
      if (steering.includes(text)) continue
      queue.delete(text)
      this.#emit(threadId, { kind: 'steer-delivered', id: steerId })
    }
  }

  /** Drops a steer the user withdrew before it was sent. */
  cancel(threadId: string, steerId: string): void {
    const queue = this.#queued.get(threadId)
    if (!queue) return

    for (const [text, id] of [...queue]) {
      if (id !== steerId) continue
      queue.delete(text)
      this.#emit(threadId, { kind: 'steer-cancelled', id: steerId })
    }
  }

  forget(threadId: string): void {
    this.#queued.delete(threadId)
  }

  pending(threadId: string): number {
    return this.#queued.get(threadId)?.size ?? 0
  }
}
