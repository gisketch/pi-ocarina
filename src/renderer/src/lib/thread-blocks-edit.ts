/** Editing a thread's list of blocks.
 *
 *  The primitives the reducer is written in, held apart from it: these are
 *  about *a list of blocks* — find the newest one this id names, rewrite it,
 *  add one, drop one — and say nothing about pi, events, or what any block
 *  means. The reducer above them is where an event decides which of these to
 *  reach for.
 */

import type { UiEvent } from '../../../shared/protocol'
import type { Block, ThreadViewModel } from './thread'

export function push(model: ThreadViewModel, block: Block): ThreadViewModel {
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
export function editBlock<K extends Block['kind']>(
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
export function decide<K extends Block['kind']>(
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
export function finishCompaction(
  model: ThreadViewModel,
  id: string,
  outcome: Omit<Block & { kind: 'compaction' }, 'kind' | 'id'>,
): ThreadViewModel {
  const next = editBlock(model, id, 'compaction', (block) => ({ ...block, ...outcome }))
  if (next !== model) return next

  return push(model, { kind: 'compaction', id, ...outcome })
}

export function dropBlock(model: ThreadViewModel, id: string): ThreadViewModel {
  const blocks = model.blocks.filter((block) => block.id !== id)
  return blocks.length === model.blocks.length ? model : { ...model, blocks }
}
