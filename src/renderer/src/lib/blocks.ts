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

import { parseMarkdown } from './markdown'
import { segmentText, segmentsOf } from './markdown-segments'
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
  /** Set when a message split around a fenced block. */
  segment?: number
  /** The session entry this message can be rewound to, when it is one. */
  checkpointId?: string
  /** Short human label — the block menu's header shows it. */
  label: string
  /** What `copy` takes: the whole message, or a tool row's target. */
  text: string
  /** The file a row changed, when the row carries a diff. What the menu's
   *  entry into the viewer opens at. */
  diffPath?: string
}

const LABEL_MAX = 40

function short(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat
}

/** What a card is about, in full. */
function cardText(block: Block): string {
  switch (block.kind) {
    case 'ask':
      // Every prompt, so a leap or a search matches on the question the reader
      // can see rather than only on the first one.
      return block.questions.map((question) => question.prompt).join(' · ')
    case 'approve':
      return block.command
    case 'compaction':
      return 'compaction'
    case 'steer':
      return block.text
    case 'raw':
      return block.rawKind
    default:
      return block.kind
  }
}

/** What each card calls itself in the menu's header. */
function cardLabel(block: Block): string {
  return short(cardText(block))
}

function toolEntry(blockId: string, row: ToolRow): NavBlock {
  return {
    id: `${blockId}:${row.id}`,
    kind: 'tool',
    blockId,
    rowId: row.id,
    label: short(`${row.kind} ${row.target}`),
    ...(row.body?.type === 'diff' ? { diffPath: row.target } : {}),
    // The target, not the whole row: a path or a command is the thing a reader
    // wants in the clipboard, and "read src/a.ts" pastes into nothing.
    text: row.target,
  }
}

/** What a segment calls itself in the block menu's header. A standalone kind
 *  says which kind it is, because its source alone — a URL, a row of cells —
 *  does not read as one. */
function labelFor(kind: string | undefined, source: string): string {
  if (kind === 'code') return `code ${source}`
  if (kind === 'image') return `image ${source}`
  if (kind === 'table') return `table ${source.split('\n')[0] ?? ''}`
  return source
}

/** One message's stops.
 *
 *  A message with no fenced block is one stop, keeping the block's own id — so
 *  nothing about the common case changes. One that has code splits around it,
 *  and the pieces are numbered with `#` rather than `:`, because a block id can
 *  already contain a colon (`user:e1`) and the ledger's row separator would be
 *  ambiguous here. */
function messageEntries(kind: 'user' | 'agent', blockId: string, text: string): NavBlock[] {
  const segments = segmentsOf(parseMarkdown(text))
  if (segments.length <= 1) {
    return [{ id: blockId, kind, blockId, label: short(text), text }]
  }

  return segments.map((segment, at) => {
    const source = segmentText(segment)
    return {
      id: `${blockId}#${at}`,
      kind,
      blockId,
      segment: at,
      label: short(labelFor(segment[0]?.type, source)),
      text: source,
    }
  })
}

/** Flattens a rendered thread into the things a reader can point at.
 *
 *  Checkpoints produce no entry of their own; their id rides along on the user
 *  message from the same session entry, and the separator has nothing left to
 *  draw. Which side that message is on depends on where the thread came from:
 *
 *  - Replaying a session reads the entry once and emits the checkpoint first
 *    (`replay.ts`).
 *  - A live turn emits the message from the driver before pi is even asked
 *    (`pi-driver.ts`), and the checkpoint arrives later from the translator,
 *    when pi appends the entry.
 *
 *  So a checkpoint attaches to whichever user message is *adjacent* to it, and
 *  prefers the one just before. Adjacency is the whole rule: it is what stops
 *  a checkpoint from reaching past a message that produced no blocks and
 *  labelling the next one with an entry that rewinds further back than the
 *  reader is pointing. A checkpoint with no neighbouring message is dropped. */
export function navBlocks(blocks: Block[]): NavBlock[] {
  const list: NavBlock[] = []
  /** A checkpoint waiting for the message that comes after it. */
  let pending: string | null = null
  /** The message that came immediately before, when one did. */
  let adjacent: NavBlock | null = null

  for (const block of blocks) {
    if (block.kind === 'checkpoint') {
      if (adjacent !== null && adjacent.checkpointId === undefined) {
        adjacent.checkpointId = block.id
        pending = null
      } else {
        pending = block.id
      }
      adjacent = null
      continue
    }

    if (block.kind === 'ledger') {
      for (const row of block.rows) {
        list.push(toolEntry(block.id, row))
        // A child agent is a stop of its own, and has to be: it is always
        // nested under its spawn call, and `l` on it is the only way into the
        // peek. Its *tool* rows are not — pointing at a subagent's third read
        // is not something the reader can ask for.
        for (const child of agentsIn(row)) list.push(toolEntry(block.id, child))
      }
      pending = null
      adjacent = null
      continue
    }

    if (block.kind === 'user' || block.kind === 'agent') {
      const entries = messageEntries(block.kind, block.id, block.text)
      // The checkpoint belongs to the message, so it rides on its first stop.
      const first = entries[0]
      if (block.kind === 'user' && first && pending !== null) first.checkpointId = pending

      list.push(...entries)
      pending = null
      adjacent = block.kind === 'user' ? (first ?? null) : null
      continue
    }

    list.push({
      id: block.id,
      kind: block.kind,
      blockId: block.id,
      label: cardLabel(block),
      // Untruncated: `copy` on an approve card must give back a command that
      // still runs, not the 40 characters the header had room for.
      text: cardText(block),
    })
    pending = null
    adjacent = null
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

/** Every agent row under this one, at any depth, in the order they are drawn. */
function agentsIn(row: ToolRow): ToolRow[] {
  const found: ToolRow[] = []
  for (const child of row.children ?? []) {
    if (child.agent) found.push(child)
    found.push(...agentsIn(child))
  }
  return found
}
