/** The folds around one nav stop, innermost first.
 *
 *  `h` in READ closes the nearest open fold — vim's `zc`: a row's own body,
 *  then the group the row is a member of, then the whole turn. This module
 *  only names the candidates in that order; whether each is *open* is state
 *  the caller holds (`toolOpen` plus the shown rules), so the walk stays
 *  pure and testable without a store. */

import { groupNavId, type NavBlock } from './blocks'
import { accordionNavId, turnsOf, type TurnItem } from './turn-accordion'
import { groupRows, type RowGroup } from './ledger-groups'
import { isExpandable } from './ledger'
import type { Block, ToolRow } from './thread'

type Turn = Extract<TurnItem, { kind: 'turn' }>

export type Fold =
  | { kind: 'row'; navId: string; row: ToolRow }
  | { kind: 'group'; navId: string; group: RowGroup }
  | { kind: 'accordion'; navId: string; turn: Turn }

/** A row anywhere under these rows, nested children included. */
function rowIn(rows: readonly ToolRow[], id: string): ToolRow | undefined {
  for (const row of rows) {
    if (row.id === id) return row
    const nested = rowIn(row.children ?? [], id)
    if (nested) return nested
  }
  return undefined
}

export function foldChain(blocks: Block[], entry: NavBlock): Fold[] {
  const folds: Fold[] = []
  const ledger = blocks.find(
    (block) => block.kind === 'ledger' && block.id === entry.blockId,
  )

  if (entry.rowId?.startsWith('accordion:')) {
    // The header is the turn's own fold and has no parent above it.
    const turn = turnsOf(blocks).find(
      (item) => item.kind === 'turn' && item.id === entry.blockId,
    )
    return turn?.kind === 'turn' ? [{ kind: 'accordion', navId: entry.id, turn }] : []
  }

  if (entry.rowId !== undefined && ledger?.kind === 'ledger') {
    if (entry.rowId.startsWith('group:')) {
      const id = entry.rowId.slice('group:'.length)
      for (const item of groupRows(ledger.rows)) {
        if (item.kind === 'group' && item.id === id) {
          folds.push({ kind: 'group', navId: entry.id, group: item })
        }
      }
    } else {
      const row = rowIn(ledger.rows, entry.rowId)
      if (row !== undefined && isExpandable(row)) {
        folds.push({ kind: 'row', navId: entry.id, row })
      }
      // The group this row is a member of — the parent a grandchild's `h`
      // closes, never the whole turn while the group still stands.
      for (const item of groupRows(ledger.rows)) {
        if (item.kind === 'group' && item.rows.some((one) => one.id === entry.rowId)) {
          folds.push({ kind: 'group', navId: groupNavId(entry.blockId, item), group: item })
        }
      }
    }
  }

  // The turn whose hidden work this block is part of. Openers and final
  // answers are outside the accordion, so they reach no fold here.
  const turn = turnsOf(blocks).find(
    (item) => item.kind === 'turn' && item.inner.some((block) => block.id === entry.blockId),
  )
  if (turn?.kind === 'turn') {
    folds.push({ kind: 'accordion', navId: accordionNavId(turn.id), turn })
  }
  return folds
}
