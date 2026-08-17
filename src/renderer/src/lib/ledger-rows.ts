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
  return rows.flatMap((row) => [row, ...pointableRows(drawnChildren(row).filter(isAgent))])
}

/** The children of a row that are actually drawn.
 *
 *  The cap and the stop list have to agree: a row that navigation can land on
 *  but the transcript does not draw is a `j` that appears to do nothing, and a
 *  ring on something invisible. One function so they cannot drift. */
export function drawnChildren(row: ToolRow): readonly ToolRow[] {
  const children = row.children ?? []
  if (!row.agent) return children

  // A nested agent is never hidden: it is a stop, and hiding it would take the
  // peek with it. The cap is for the plain tool calls it is buried in.
  const agents = children.filter(isAgent)
  const calls = children.filter((child) => !isAgent(child))
  const { shown } = tailOf(calls)

  // Redrawn in the order they arrived, so the list still reads as a sequence.
  const kept = new Set([...agents, ...shown])
  return children.filter((child) => kept.has(child))
}

/** How many of a row's children the transcript is not drawing. */
export function hiddenUnder(row: ToolRow): number {
  return (row.children ?? []).length - drawnChildren(row).length
}

function isAgent(row: ToolRow): boolean {
  return row.agent !== undefined
}

/** How many of a child's own calls the transcript shows.
 *
 *  A scout can make thirty calls, and thirty indented rows under one child bury
 *  the fan-out they belong to. The peek is where all of them live; the
 *  transcript keeps the tail. */
export const SHOWN_CALLS = 5

/** The calls to draw under a child, newest last, with a count of what is
 *  hidden.
 *
 *  The *latest* are kept rather than the first: what a child did a minute ago is
 *  the thing a reader is looking for, and the early calls are the ones the peek
 *  is for. */
export function tailOf(
  rows: readonly ToolRow[],
  limit: number = SHOWN_CALLS,
): { hidden: number; shown: readonly ToolRow[] } {
  if (rows.length <= limit) return { hidden: 0, shown: rows }
  return { hidden: rows.length - limit, shown: rows.slice(-limit) }
}
