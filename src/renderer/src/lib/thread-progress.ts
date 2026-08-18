/** A turn's own bookkeeping: its clock, and the thought rows it writes.
 *
 *  Split from the reducer because both answer the same question — what a turn
 *  is doing — and neither is about the shape of a block. The reducer decides
 *  which of these an event reaches for.
 */

import type { UiEvent } from '../../../shared/protocol'
import { elapsed } from './elapsed'
import { editLedger, updateRow } from './thread-rows'
import type { ThreadViewModel, ToolRow, TurnSpan } from './thread'

/** What a thought has said so far. A row whose body is anything else has not
 *  been written to yet, which is the state a `reasoning-start` leaves it in. */
export function thoughtOf(row: ToolRow): string {
  return row.body?.type === 'thought' ? row.body.text : ''
}

/** Rewrites one row of whichever ledger holds it. */
export function updateRowIn(
  model: ThreadViewModel,
  id: string,
  change: (row: ToolRow) => ToolRow,
): ThreadViewModel {
  const blocks = editLedger(model.blocks, (rows) => updateRow(rows, id, change))
  return blocks ? { ...model, blocks } : model
}

/** The turn's clock, advanced by the one event that says a turn changed state.
 *
 *  Started on the way *into* `running` and stopped on the way out, so the
 *  span is the time the reader actually waited. A reopened thread replays its
 *  history and lands on `idle` or `done` without ever passing through
 *  `running`, so it gets no turn and draws no footer — which is honest: the
 *  session log records what was said, not how long it took to say. */
export function turnFor(
  model: ThreadViewModel,
  event: UiEvent & { kind: 'thread-state' },
): TurnSpan | undefined {
  if (event.state === 'running') {
    // Already timing this one. `running` arrives again after an approval or an
    // answered question, and restarting the clock there would report the last
    // stretch rather than the turn.
    return model.turn && model.turn.endedAt === undefined ? model.turn : { startedAt: Date.now() }
  }

  // A gate is the turn waiting on a person, not the turn ending. The clock
  // keeps running because the reader is still waiting for an answer.
  if (event.state === 'waiting-input') return model.turn
  if (!model.turn || model.turn.endedAt !== undefined) return model.turn

  const outcome =
    event.state === 'failed' ? 'failed' : event.state === 'done' ? 'done' : 'stopped'
  return { ...model.turn, endedAt: Date.now(), outcome }
}
