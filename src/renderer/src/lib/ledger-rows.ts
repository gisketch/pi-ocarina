/** Walking a ledger's rows, which are the one part of the view model that is
 *  not a flat list.
 *
 *  Held apart from the component so the two questions it answers can be tested
 *  without a DOM: how wide the gutter must be, and which rows a reader can
 *  actually point at. Both used to read the top level only, and both were wrong
 *  once a child agent could be nested and focused. */

import type { ToolKind, ToolRow } from './thread'

/** Every kind drawn anywhere in the ledger, at any depth.
 *
 *  The gutter is as wide as the widest word it could ever hold, and every row
 *  shares the one number — so a nested row's label must be counted or the
 *  targets stop lining up when one appears. */
export function kindsIn(rows: readonly ToolRow[]): ToolKind[] {
  return rows.flatMap((row) => [row.kind, ...kindsIn(row.children ?? [])])
}

/** Every row a reader can point at: the top level, and the child agents nested
 *  under it.
 *
 *  A subagent's own reads are deliberately not stops — pointing at its third
 *  read is not something a reader asks for. A child agent is, because `l` on it
 *  is the only way into the peek. The ledger's dim and its paint containment
 *  both read this: without it a focused child left the whole spine dimmed
 *  around it, and a menu opened on a child was clipped by containment the
 *  ledger never lifted. */
export function pointableRows(rows: readonly ToolRow[]): ToolRow[] {
  return rows.flatMap((row) => [
    row,
    ...pointableRows((row.children ?? []).filter((child) => child.agent !== undefined)),
  ])
}
