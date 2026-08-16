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

/** Usage comes from pi's own accounting; the app never estimates its own. */
export function emitUsage(emit: Emit, threadId: string, session: AgentSession): void {
  try {
    const stats = session.getSessionStats()
    emit(threadId, {
      kind: 'usage',
      contextPercent: stats.contextUsage?.percent ?? 0,
      tokens: stats.tokens.total,
      costUsd: stats.cost,
    })
  } catch {
    // Stats are a nicety; losing them must never break a turn.
  }
}
