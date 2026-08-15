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
import type { Block, ThreadViewModel, ToolRow } from './thread'
import { EMPTY_THREAD } from './thread'
import { editLedger, nestRow, trailingLedger, updateRow } from './thread-rows'

/** Applies one event. */
export function reduceThread(model: ThreadViewModel, event: UiEvent): ThreadViewModel {
  const next = apply(model, event)
  const status = derive(next)
  return status === next.status ? next : { ...next, status }
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
      return { ...model, runState: event.state, reason: event.reason }

    case 'user-message':
      return push(model, { kind: 'user', id: event.id, text: event.text })

    case 'agent-message-start':
      return push(model, { kind: 'agent', id: event.id, text: '', streaming: true })

    case 'agent-message-delta':
      return growMessage(model, event.id, event.text)

    case 'agent-message-end':
      return editBlock(model, event.id, (block) =>
        block.kind === 'agent' ? { ...block, streaming: false } : block,
      )

    case 'tool-start':
      return startTool(model, event)

    case 'tool-progress':
      return settleRow(model, event.id, (row) => ({ ...row, meta: event.meta }), event)

    case 'tool-body':
      return settleRow(model, event.id, (row) => ({ ...row, body: event.body }), event)

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
        question: event.question,
        options: event.options,
      })

    case 'ask-answered':
      return decide(model, event.id, event, (block) =>
        block.kind === 'ask' ? { ...block, answeredIndex: event.optionIndex } : block,
      )

    case 'approve':
      return push(model, {
        kind: 'approve',
        id: event.id,
        command: event.command,
        note: event.note,
      })

    case 'approve-resolved':
      return decide(model, event.id, event, (block) =>
        block.kind === 'approve' ? { ...block, outcome: event.outcome } : block,
      )

    case 'checkpoint':
      return push(model, { kind: 'checkpoint', id: event.id, label: event.label })

    case 'compaction-start':
      return push(model, { kind: 'compaction', id: event.id, running: true })

    case 'compaction-done':
      return finishCompaction(model, event)

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
function derive(model: ThreadViewModel): ThreadRunState {
  if (model.runState === 'failed' || model.runState === 'interrupted') return model.runState
  return model.blocks.some(isPendingGate) ? 'waiting-input' : model.runState
}

function isPendingGate(block: Block): boolean {
  if (block.kind === 'ask') return block.answeredIndex === undefined
  if (block.kind === 'approve') return block.outcome === undefined
  return false
}

function push(model: ThreadViewModel, block: Block): ThreadViewModel {
  return { ...model, blocks: [...model.blocks, block] }
}

/** Rewrites the block `id` names. Returns the model untouched when there is no
 *  such block, or when `change` declined it — callers rely on that identity to
 *  tell "applied" from "nothing to apply it to". */
function editBlock(
  model: ThreadViewModel,
  id: string,
  change: (block: Block) => Block,
): ThreadViewModel {
  const index = model.blocks.findLastIndex((block) => block.id === id)
  if (index === -1) return model

  const edited = change(model.blocks[index])
  if (edited === model.blocks[index]) return model

  const blocks = model.blocks.slice()
  blocks[index] = edited
  return { ...model, blocks }
}

/** Applies a decision to the card it names, or says so if that card is gone.
 *
 *  A decision is not decoration: an answer or an approval outcome is a record
 *  of what a person chose. Losing one because its card never arrived would be
 *  the same lie as dropping an unknown event. */
function decide(
  model: ThreadViewModel,
  id: string,
  event: UiEvent,
  change: (block: Block) => Block,
): ThreadViewModel {
  const next = editBlock(model, id, change)
  if (next !== model) return next

  return push(model, {
    kind: 'raw',
    id: `orphan-${id}-${model.blocks.length}`,
    rawKind: `${event.kind} for unknown card`,
    detail: id,
  })
}

/** Ends a compaction. If no running divider matches, the summary still lands as
 *  a card of its own: a shimmer that never stops would claim the app is busy
 *  forever, and the compaction did in fact happen. */
function finishCompaction(
  model: ThreadViewModel,
  event: UiEvent & { kind: 'compaction-done' },
): ThreadViewModel {
  const done = {
    running: false,
    beforePercent: event.beforePercent,
    afterPercent: event.afterPercent,
    summary: event.summary,
  }

  const next = editBlock(model, event.id, (block) =>
    block.kind === 'compaction' ? { ...block, ...done } : block,
  )
  if (next !== model) return next

  return push(model, { kind: 'compaction', id: event.id, ...done })
}

function dropBlock(model: ThreadViewModel, id: string): ThreadViewModel {
  const blocks = model.blocks.filter((block) => block.id !== id)
  return blocks.length === model.blocks.length ? model : { ...model, blocks }
}

/** A delta for a message that never started still carries the agent's words,
 *  so it opens the message rather than being discarded. */
function growMessage(model: ThreadViewModel, id: string, text: string): ThreadViewModel {
  const known = model.blocks.some((block) => block.kind === 'agent' && block.id === id)
  if (!known) return push(model, { kind: 'agent', id, text, streaming: true })

  return editBlock(model, id, (block) =>
    block.kind === 'agent' ? { ...block, text: block.text + text } : block,
  )
}

function startTool(
  model: ThreadViewModel,
  event: UiEvent & { kind: 'tool-start' },
): ThreadViewModel {
  const row: ToolRow = {
    id: event.id,
    kind: event.tool,
    target: event.target,
    status: 'running',
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

  return editBlock(model, ledger.id, (block) =>
    block.kind === 'ledger' ? { ...block, rows: [...block.rows, row] } : block,
  )
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
