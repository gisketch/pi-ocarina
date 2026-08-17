/** What a listener is owed about a thread it did not watch happen.
 *
 *  Both routes into a thread need the same two things said — its history, and
 *  pi's accounting of it — and they are said the same way whether the session
 *  was just opened from disk or has been running here all along. Kept apart
 *  from the driver because the driver's job is to run turns; this is what it
 *  tells anyone who arrives late. */

import type { AgentSession, SessionEntry } from '@earendil-works/pi-coding-agent'
import type { UiEvent } from '../../shared/protocol'
import { emitReplay } from './replay'

type Emit = (threadId: string, event: UiEvent) => void

/** States a thread from its history, replacing whatever the renderer holds. */
export function replayInto(emit: Emit, threadId: string, entries: readonly SessionEntry[]): void {
  emitReplay((event) => emit(threadId, event), entries)
}

/** What this thread's children have spent, which pi cannot know about. */
export interface ChildSpend {
  tokens: number
  costUsd: number
}

/** Usage comes from pi's own accounting; the app never estimates its own.
 *
 *  Children are the exception, and have to be: they are sessions pi has no
 *  handle on, so their tokens are invisible to `getSessionStats`. Adding them
 *  in is what stops a fan-out reading as having made a thread *cheaper* — the
 *  parent's own count falls when work moves to a child, so an uncounted child
 *  would look like a saving rather than a bill.
 *
 *  Only the totals move. The context percentage stays the parent's, because a
 *  child's context is its own and dies with it — that number is about how full
 *  *this* conversation is. */
export function emitUsage(
  emit: Emit,
  threadId: string,
  session: AgentSession,
  children: ChildSpend = { tokens: 0, costUsd: 0 },
): void {
  try {
    const stats = session.getSessionStats()
    emit(threadId, {
      kind: 'usage',
      contextPercent: stats.contextUsage?.percent ?? 0,
      tokens: stats.tokens.total + children.tokens,
      costUsd: stats.cost + children.costUsd,
    })
  } catch {
    // Stats are a nicety; losing them must never break a turn.
  }
}
