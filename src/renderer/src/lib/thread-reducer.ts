/** The thread reducer: `(viewModel, event) → viewModel`, pure.
 *
 *  One function serves both paths. Live events from a running turn and the
 *  replay of a session file on disk arrive in the same vocabulary, so a thread
 *  reopened tomorrow renders through exactly the code that drew it today —
 *  there is no second projection to drift.
 *
 *  Nothing is ever dropped. An event this build cannot name becomes a visible
 *  `raw` block, and so does an event about a tool row that never started: a
 *  silently swallowed event is a lie about what the agent did. */

import type { UiEvent } from '../../../shared/protocol'
import type { ThreadRunState } from '../../../shared/vocabulary'
import type { Block, ThreadViewModel, ToolRow, TurnSpan } from './thread'
import { growTurnMessage, settleTurnMessage } from './thread-turn'
import { EMPTY_THREAD } from './thread'
import { editLedger, nestRow, trailingLedger, updateRow } from './thread-rows'
import {
  decide,
  dropBlock,
  editBlock,
  finishCompaction,
  push,
} from './thread-blocks-edit'

/** Applies one event. */
export function reduceThread(model: ThreadViewModel, event: UiEvent): ThreadViewModel {
  const next = apply(model, event)
  const status = derive(next)
  // The pending question is only recomputed when a card could have changed —
  // every other event leaves it exactly where it was, and this runs on every
  // token of every stream.
  const asked = event.kind === 'ask' || event.kind === 'ask-answered'
  const pendingAskId = asked ? pendingAsk(next) : (next.pendingAskId ?? null)

  if (status === next.status && pendingAskId === (next.pendingAskId ?? null)) return next
  return { ...next, status, pendingAskId }
}

/** Applies a whole coalesced batch, so one burst costs one assignment. */
export function reduceBatch(model: ThreadViewModel, events: readonly UiEvent[]): ThreadViewModel {
  return events.reduce(reduceThread, model)
}

/** Builds a thread from nothing — the replay entry point. */
export function replayThread(events: readonly UiEvent[]): ThreadViewModel {
  return reduceBatch(EMPTY_THREAD, events)
}

function apply(model: ThreadViewModel, event: UiEvent): ThreadViewModel {
  switch (event.kind) {
    case 'thread-reset':
      return EMPTY_THREAD

    case 'thread-state':
      return { ...model, runState: event.state, reason: event.reason, turn: turnFor(model, event) }

    case 'user-message':
      return push(model, {
        kind: 'user',
        id: event.id,
        text: event.text,
        ...(event.attachments?.length ? { attachments: event.attachments } : {}),
      })

    case 'reasoning-start':
      return push(model, { kind: 'reasoning', id: event.id, text: '', streaming: true })

    case 'reasoning-delta':
      return editBlock(model, event.id, 'reasoning', (block) => ({
        ...block,
        text: block.text + event.text,
      }))

    case 'reasoning-end':
      return editBlock(model, event.id, 'reasoning', (block) => ({
        ...block,
        streaming: false,
        ms: event.ms,
      }))

    // Starting a message is not evidence the agent said anything. pi splits a
    // tool-calling turn into a chain of assistant messages that carry no text
    // at all, so a block made here would be an empty "PI" before every tool
    // call — and would cut the run of calls into unrelated-looking ledgers.
    case 'agent-message-start':
      return model

    case 'agent-message-delta':
      return growTurnMessage(model, event.text)

    case 'agent-message-end':
      return settleTurnMessage(model)

    case 'tool-start':
      return startTool(model, event)

    case 'tool-progress':
      return settleRow(model, event.id, (row) => ({ ...row, meta: event.meta }), event)

    // A child agent settling, or its usage moving. Separate from `tool-end`
    // because a child ends in ways a tool call has no word for — denied at the
    // gate, stopped by the reader — and the row must keep the distinction the
    // envelope makes.
    case 'agent-update':
      return settleRow(model, event.id, (row) => ({ ...row, agent: event.agent }), event)

    case 'tool-body':
      return settleRow(
        model,
        event.id,
        (row) => ({
          ...row,
          body: event.body,
          // A change to a file is what the reader came to read, so it arrives
          // open. Keyed on the body rather than on the tool kind: a `write`
          // that produced no diff has nothing to open, and a row that opens on
          // to nothing is worse than one that stays shut.
          ...(event.body.type === 'diff' ? { open: true } : {}),
        }),
        event,
      )

    case 'tool-end':
      return settleRow(
        model,
        event.id,
        (row) => ({ ...row, status: event.status, meta: event.meta ?? row.meta }),
        event,
      )

    case 'ask':
      return push(model, {
        kind: 'ask',
        id: event.id,
        questions: event.questions,
      })

    case 'ask-answered':
      return decide(model, event.id, 'ask', event, (block) => ({
        ...block,
        outcome: event.outcome,
        answers: event.answers,
        said: event.said,
        reason: event.reason,
      }))

    case 'approve':
      return push(model, {
        kind: 'approve',
        id: event.id,
        command: event.command,
        note: event.note,
        agent: event.agent,
      })

    case 'approve-resolved':
      return decide(model, event.id, 'approve', event, (block) => ({
        ...block,
        outcome: event.outcome,
      }))

    case 'checkpoint':
      return push(model, { kind: 'checkpoint', id: event.id, label: event.label })

    case 'compaction-start':
      return push(model, { kind: 'compaction', id: event.id, running: true })

    case 'compaction-done':
      return finishCompaction(model, event.id, {
        running: false,
        beforePercent: event.beforePercent,
        afterPercent: event.afterPercent,
        summary: event.summary,
      })

    case 'compaction-skipped':
      return finishCompaction(model, event.id, { running: false, skipped: event.reason })

    case 'steer-queued':
      return push(model, { kind: 'steer', id: event.id, text: event.text })

    // Delivered text becomes part of the turn; a cancelled steer never
    // happened. Either way the pending row has nothing left to say.
    case 'steer-delivered':
    case 'steer-cancelled':
      return dropBlock(model, event.id)

    case 'usage':
      return {
        ...model,
        usage: {
          contextPercent: event.contextPercent,
          tokens: event.tokens,
          costUsd: event.costUsd,
        },
      }

    case 'model':
      return {
        ...model,
        model: {
          provider: event.provider,
          id: event.id,
          name: event.name,
          reasoning: event.reasoning,
        },
      }

    case 'connectivity':
      return {
        ...model,
        connectivity: { state: event.state, retryInSeconds: event.retryInSeconds },
      }

    case 'raw':
      return push(model, {
        kind: 'raw',
        id: `raw-${model.blocks.length}`,
        rawKind: event.rawKind,
        detail: event.detail,
      })
  }
}

/** Pending gates outrank a running turn — the agent is waiting on a person, and
 *  the header should say so. A thread that has already failed or been
 *  interrupted keeps that state: the gate is moot once the turn is over. */
/** The oldest unanswered question, which is the one the reader should answer:
 *  two calls in one turn each draw a card, and the one that has been waiting is
 *  the one holding the keys. */
function pendingAsk(model: ThreadViewModel): string | null {
  for (const block of model.blocks) {
    if (block.kind === 'ask' && block.outcome === undefined) return block.id
  }
  return null
}

function derive(model: ThreadViewModel): ThreadRunState {
  if (model.runState === 'failed' || model.runState === 'interrupted') return model.runState
  return model.blocks.some(isPendingGate) ? 'waiting-input' : model.runState
}

function isPendingGate(block: Block): boolean {
  // Pending until it has ended, however it ended: a question released by a
  // cancelled turn is not waiting on anyone.
  if (block.kind === 'ask') return block.outcome === undefined
  if (block.kind === 'approve') return block.outcome === undefined
  return false
}



/** The turn's clock, advanced by the one event that says a turn changed state.
 *
 *  Started on the way *into* `running` and stopped on the way out, so the
 *  span is the time the reader actually waited. A reopened thread replays its
 *  history and lands on `idle` or `done` without ever passing through
 *  `running`, so it gets no turn and draws no footer — which is honest: the
 *  session log records what was said, not how long it took to say. */
function turnFor(
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

/** A delta for a message that never started still carries the agent's words,
 *  so it opens the message rather than being discarded. */
function startTool(
  model: ThreadViewModel,
  event: UiEvent & { kind: 'tool-start' },
): ThreadViewModel {
  const row: ToolRow = {
    id: event.id,
    kind: event.tool,
    target: event.target,
    status: 'running',
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.agent ? { agent: event.agent } : {}),
  }

  if (event.parentId) {
    const parentId = event.parentId
    const blocks = editLedger(model.blocks, (rows) => nestRow(rows, parentId, row))
    if (blocks) return { ...model, blocks }
    // The parent row is gone; the call still happened, so it lands as its own
    // top-level row rather than vanishing with its missing subagent.
  }

  const ledger = trailingLedger(model.blocks)
  if (!ledger) return push(model, { kind: 'ledger', id: `ledger-${event.id}`, rows: [row] })

  return editBlock(model, ledger.id, 'ledger', (block) => ({
    ...block,
    rows: [...block.rows, row],
  }))
}

/** Applies a change to the row `id` names, or records that no such row exists. */
function settleRow(
  model: ThreadViewModel,
  id: string,
  change: (row: ToolRow) => ToolRow,
  event: UiEvent,
): ThreadViewModel {
  const blocks = editLedger(model.blocks, (rows) => updateRow(rows, id, change))
  if (blocks) return { ...model, blocks }

  return push(model, {
    kind: 'raw',
    id: `orphan-${id}-${model.blocks.length}`,
    rawKind: `${event.kind} for unknown tool`,
    detail: id,
  })
}
