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
      return editBlock(model, event.id, 'agent', (block) => ({ ...block, streaming: false }))

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
      return decide(model, event.id, 'ask', event, (block) => ({
        ...block,
        answeredIndex: event.optionIndex,
      }))

    case 'approve':
      return push(model, {
        kind: 'approve',
        id: event.id,
        command: event.command,
        note: event.note,
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

/** Rewrites the newest block of `kind` that `id` names. Returns the model
 *  untouched when there is no such block, so callers can tell "applied" from
 *  "nothing to apply it to".
 *
 *  The kind is part of the lookup, not a check inside `change`: ids come from
 *  several sources and are only unique within a kind. Matching on id alone
 *  would let an unrelated block shadow the one being edited, and the edit would
 *  be dropped without a trace. */
function editBlock<K extends Block['kind']>(
  model: ThreadViewModel,
  id: string,
  kind: K,
  change: (block: Extract<Block, { kind: K }>) => Block,
): ThreadViewModel {
  const index = model.blocks.findLastIndex((block) => block.id === id && block.kind === kind)
  if (index === -1) return model

  const edited = change(model.blocks[index] as Extract<Block, { kind: K }>)
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
function decide<K extends Block['kind']>(
  model: ThreadViewModel,
  id: string,
  kind: K,
  event: UiEvent,
  change: (block: Extract<Block, { kind: K }>) => Block,
): ThreadViewModel {
  const next = editBlock(model, id, kind, change)
  if (next !== model) return next

  return push(model, {
    kind: 'raw',
    id: `orphan-${id}-${model.blocks.length}`,
    rawKind: `${event.kind} for unknown card`,
    detail: id,
  })
}

/** Ends a compaction, whether it produced a summary or was refused. If no
 *  running divider matches, the outcome still lands as a card of its own: a
 *  shimmer that never stops would claim the app is busy forever, and something
 *  did in fact happen. */
function finishCompaction(
  model: ThreadViewModel,
  id: string,
  outcome: Omit<Block & { kind: 'compaction' }, 'kind' | 'id'>,
): ThreadViewModel {
  const next = editBlock(model, id, 'compaction', (block) => ({ ...block, ...outcome }))
  if (next !== model) return next

  return push(model, { kind: 'compaction', id, ...outcome })
}

function dropBlock(model: ThreadViewModel, id: string): ThreadViewModel {
  const blocks = model.blocks.filter((block) => block.id !== id)
  return blocks.length === model.blocks.length ? model : { ...model, blocks }
}

/** A delta for a message that never started still carries the agent's words,
 *  so it opens the message rather than being discarded. */
function growMessage(model: ThreadViewModel, id: string, text: string): ThreadViewModel {
  const grown = editBlock(model, id, 'agent', (block) => ({ ...block, text: block.text + text }))
  if (grown !== model) return grown

  return push(model, { kind: 'agent', id, text, streaming: true })
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
