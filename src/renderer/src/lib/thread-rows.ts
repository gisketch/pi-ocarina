/** Row surgery for the thread reducer.
 *
 *  Tool rows are the one part of the view model that is not a flat list: a
 *  subagent's calls nest one level under it. These helpers keep that nesting
 *  the only special case, and keep every write immutable so the reducer stays
 *  pure. Each returns the array it was given when nothing matched, which is how
 *  callers tell "changed" from "no such row". */

import type { Block, ToolRow } from './thread'

export type LedgerBlock = Block & { kind: 'ledger' }

/** Replaces the row with `id` wherever it sits. */
export function updateRow(
  rows: ToolRow[],
  id: string,
  change: (row: ToolRow) => ToolRow,
): ToolRow[] {
  let touched = false

  const next = rows.map((row) => {
    if (row.id === id) {
      touched = true
      return change(row)
    }

    const children = row.children
    if (!children) return row

    const updated = updateRow(children, id, change)
    if (updated === children) return row

    touched = true
    return { ...row, children: updated }
  })

  return touched ? next : rows
}

/** Adds `row` under `parentId`, wherever that parent sits.
 *
 *  Two levels of nesting are reachable — a child agent may spawn its own, and
 *  a grandchild may not spawn at all — so this walks to the parent rather than
 *  adopting a deep row into the row above it. A row whose parent is missing is
 *  reported as unplaced by returning the array unchanged; the caller lands it
 *  at the top level rather than dropping it, because the call did happen. */
export function nestRow(rows: ToolRow[], parentId: string, row: ToolRow): ToolRow[] {
  let placed = false

  const next = rows.map((candidate) => {
    if (placed) return candidate

    if (candidate.id === parentId) {
      placed = true
      return { ...candidate, children: [...(candidate.children ?? []), row] }
    }

    const children = candidate.children
    if (!children) return candidate

    const nested = nestRow(children, parentId, row)
    if (nested === children) return candidate

    placed = true
    return { ...candidate, children: nested }
  })

  return placed ? next : rows
}

/** The ledger a new row belongs to: the trailing one, if the last block is a
 *  ledger. Anything else — a message, a card — closes the group, because the
 *  reference draws each run of tool calls as its own spine. */
export function trailingLedger(blocks: Block[]): LedgerBlock | undefined {
  const last = blocks[blocks.length - 1]
  return last?.kind === 'ledger' ? last : undefined
}

/** Rewrites whichever ledger block `change` claims, newest first: a tool that
 *  is still settling is nearly always recent. Returns `undefined` when no
 *  ledger accepted the change. */
export function editLedger(
  blocks: Block[],
  change: (rows: ToolRow[]) => ToolRow[],
): Block[] | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.kind !== 'ledger') continue

    const rows = change(block.rows)
    if (rows === block.rows) continue

    const next = blocks.slice()
    next[index] = { ...block, rows }
    return next
  }

  return undefined
}

/** A block with its thinking rows taken out.
 *
 *  `o` hides what the model thought. Hiding rather than collapsing, and out of
 *  the list rather than out of view: a row left in place with its contents
 *  hidden still holds the space it stood in, and a reader who asked for the
 *  thinking to be gone would get a column of gaps where it was.
 *
 *  A ledger whose rows were *all* thinking is left empty here and dropped by
 *  `hasSomething`: an empty block still costs the column's gap, which is the
 *  space `o` was asked to reclaim. */
export function hasSomething(block: Block): boolean {
  return block.kind !== 'ledger' || block.rows.length > 0
}

export function withoutThinking(block: Block): Block {
  if (block.kind !== 'ledger') return block

  const rows = block.rows.filter((row) => row.kind !== 'think')
  return rows.length === block.rows.length ? block : { ...block, rows }
}
