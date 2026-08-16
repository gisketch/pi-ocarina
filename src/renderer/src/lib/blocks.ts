/** What the keyboard can point at inside a transcript.
 *
 *  The rendered thread is a list of blocks, but a block is not what a reader
 *  means by "this one": a ledger draws six tool calls and the reader wants the
 *  fourth. So navigation walks a flatter list than the renderer does — one
 *  entry per message, per card, and per top-level tool row.
 *
 *  Nested subagent rows are deliberately not entries. They belong to the row
 *  that spawned them, and the ledger's one-level nesting stays the single
 *  special case it already is. */

import type { Block, ToolRow } from './thread'

export interface NavBlock {
  /** Unique across the thread, and stable: this is what focus stores and what
   *  the DOM registers under. */
  id: string
  /** `tool` for a ledger row; otherwise the block's own kind. */
  kind: Block['kind'] | 'tool'
  /** The block this entry came from. */
  blockId: string
  /** Set for tool rows only. */
  rowId?: string
  /** The session entry this message can be rewound to, when it is one. */
  checkpointId?: string
  /** Short human label — the block menu's header shows it. */
  label: string
  /** What `copy` takes: the whole message, or a tool row's target. */
  text: string
}

const LABEL_MAX = 40

function short(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat
}

/** What each card calls itself when there is no text to quote. */
function cardLabel(block: Block): string {
  switch (block.kind) {
    case 'ask':
      return short(block.question)
    case 'approve':
      return short(block.command)
    case 'compaction':
      return 'compaction'
    case 'steer':
      return short(block.text)
    case 'raw':
      return block.rawKind
    default:
      return block.kind
  }
}

function toolEntry(blockId: string, row: ToolRow): NavBlock {
  return {
    id: `${blockId}:${row.id}`,
    kind: 'tool',
    blockId,
    rowId: row.id,
    label: short(`${row.kind} ${row.target}`),
    // The target, not the whole row: a path or a command is the thing a reader
    // wants in the clipboard, and "read src/a.ts" pastes into nothing.
    text: row.target,
  }
}

/** Flattens a rendered thread into the things a reader can point at.
 *
 *  Checkpoints produce no entry of their own. Both the live translator and the
 *  replay reader emit a checkpoint immediately before the user message from
 *  the same session entry, so the checkpoint's id rides along on that message
 *  and the separator has nothing left to draw. A checkpoint that reaches
 *  anything else first is dropped: it belongs to a message that is not on
 *  screen, and offering to rewind to it from an unrelated block would be a
 *  restore the reader did not ask for. */
export function navBlocks(blocks: Block[]): NavBlock[] {
  const list: NavBlock[] = []
  let pendingCheckpoint: string | null = null

  for (const block of blocks) {
    if (block.kind === 'checkpoint') {
      pendingCheckpoint = block.id
      continue
    }

    if (block.kind === 'ledger') {
      for (const row of block.rows) list.push(toolEntry(block.id, row))
      pendingCheckpoint = null
      continue
    }

    if (block.kind === 'user') {
      list.push({
        id: block.id,
        kind: 'user',
        blockId: block.id,
        label: short(block.text),
        text: block.text,
        ...(pendingCheckpoint === null ? {} : { checkpointId: pendingCheckpoint }),
      })
      pendingCheckpoint = null
      continue
    }

    list.push({
      id: block.id,
      kind: block.kind,
      blockId: block.id,
      label: block.kind === 'agent' ? short(block.text) : cardLabel(block),
      text: block.kind === 'agent' ? block.text : cardLabel(block),
    })
    pendingCheckpoint = null
  }

  return list
}

/** The next id in the direction asked for.
 *
 *  Clamps rather than wrapping: a transcript has a top and a bottom, and
 *  falling off one end into the other is how a reader loses their place. With
 *  nothing focused yet, moving down starts at the first block and moving up
 *  starts at the last — whichever end the reader was heading away from. */
export function step(list: NavBlock[], current: string | null, delta: number): string | null {
  if (list.length === 0) return null

  if (current === null) {
    return delta < 0 ? (list[list.length - 1]?.id ?? null) : (list[0]?.id ?? null)
  }

  const at = list.findIndex((entry) => entry.id === current)
  // The focused block is gone — restored away, or compacted behind a summary.
  // Start over from the end the reader was moving towards.
  if (at === -1) return delta < 0 ? (list[list.length - 1]?.id ?? null) : (list[0]?.id ?? null)

  const next = Math.min(list.length - 1, Math.max(0, at + delta))
  return list[next]?.id ?? null
}
