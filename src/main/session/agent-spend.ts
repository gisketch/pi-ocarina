/** What a thread's children have cost it.
 *
 *  Kept in main rather than derived from the rows: the figure the status bar
 *  shows has to be true before it is drawn anywhere, and the rows are the
 *  renderer's. Held apart from the fleet because it outlives any one child —
 *  it survives a settle, is rebuilt from a reopened thread's history, and is
 *  dropped when the column goes.
 *
 *  Tokens are counted the way pi counts a session's: all four buckets. Counting
 *  only input and output made a read-heavy fan-out, where cached reads dominate,
 *  report a fraction of what it spent. */

import { tokensIn, type AgentEntry, type AgentUsage } from '../../shared/vocabulary'

export interface Spent {
  tokens: number
  costUsd: number
}

const NOTHING: Spent = { tokens: 0, costUsd: 0 }

export class SpendBook {
  readonly #spent = new Map<string, Spent>()
  /** Threads whose column has gone. A child still settling must not resurrect a
   *  bill nobody can reach or clear. */
  readonly #closed = new Set<string>()

  charge(threadId: string, usage: AgentUsage): void {
    if (this.#closed.has(threadId)) return

    const held = this.#spent.get(threadId) ?? NOTHING
    this.#spent.set(threadId, {
      tokens: held.tokens + tokensIn(usage),
      costUsd: held.costUsd + usage.cost,
    })
  }

  of(threadId: string): Spent {
    return this.#spent.get(threadId) ?? NOTHING
  }

  forget(threadId: string): void {
    this.#spent.delete(threadId)
    this.#closed.add(threadId)
  }

  /** Seeds a reopened thread from the children its history recorded.
   *
   *  Without it a thread's total *fell* when it was reopened, which is the
   *  fan-out looking free the second time you look at it. */
  restore(threadId: string, entries: readonly AgentEntry[]): void {
    this.#closed.delete(threadId)
    for (const entry of entries) this.charge(threadId, entry.usage)
  }
}
