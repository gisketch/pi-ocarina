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

/** Adds `row` under `parentId`, keeping nesting one level deep: a parent that
 *  is itself nested hands the row to its own parent rather than growing a
 *  third level the ledger has no indent for. */
export function nestRow(rows: ToolRow[], parentId: string, row: ToolRow): ToolRow[] {
  let placed = false

  const next = rows.map((candidate) => {
    if (placed) return candidate

    if (candidate.id === parentId) {
      placed = true
      return { ...candidate, children: [...(candidate.children ?? []), row] }
    }

    if (candidate.children?.some((child) => child.id === parentId)) {
      placed = true
      return { ...candidate, children: [...candidate.children, row] }
    }

    return candidate
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
