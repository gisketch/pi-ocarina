/** Runs of similar tool calls, collapsed into one row.
 *
 *  A working agent produces runs of near-identical rows: seventeen outlines
 *  followed by five reads is twenty-two lines carrying three facts. The
 *  transcript charges a full row for every call, so a busy turn scrolls the
 *  conversation away.
 *
 *  This is a projection and nothing else. The rows keep their ids, their
 *  bodies and their order; the session log never hears about grouping. Leap,
 *  the block menu, and replay all still see rows — a group is only how a
 *  stretch of them is drawn. */

import type { ToolKind, ToolRow } from './thread'

/** Kinds whose runs are worth collapsing.
 *
 *  Reading, searching and asking the compiler are the calls an agent makes in
 *  sweeps, and one of them tells the reader as much as twenty. `bash` is not
 *  here: two commands in a row are two different things that happened, and a
 *  summary would hide which. */
const GROUPABLE: ReadonlySet<ToolKind> = new Set<ToolKind>(['read', 'grep', 'lsp', 'edit'])

/** How many targets a summary names before it counts the rest. */
export const NAMED_TARGETS = 3

/** What a kind's calls are *of*, so a summary reads as English.
 *
 *  The mockup says `read · 4 files`, not `4 calls`: a reader knows what four
 *  reads act on, and the word that says it costs nothing. Anything not named
 *  here counts calls, which is always true if never as good. */
const COUNTED: Readonly<Record<string, string>> = {
  read: 'file',
  edit: 'file',
  write: 'file',
  grep: 'search',
  lsp: 'lookup',
}

export function countedAs(kind: string, n: number): string {
  const noun = COUNTED[kind] ?? 'call'
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export interface RowGroup {
  kind: 'group'
  /** Stable across a run's growth: the first member's id. Expansion state is
   *  keyed on this, so a group that gains a member stays open. */
  id: string
  tool: ToolKind
  rows: ToolRow[]
  /** `worker.ts · retry.ts · queue.ts +1` */
  preview: string
  /** Summed from the members: `412L`, `+41 −12`. Empty when they said
   *  nothing worth summing. */
  meta: string
  /** The run is still producing calls. A live group draws open. */
  live: boolean
}

export type LedgerItem = { kind: 'row'; row: ToolRow } | RowGroup

/** Whether a row may join a group at all.
 *
 *  A failure, a denial, or a cancellation is the one row in a sweep a reader
 *  needs to see, and a summary counting it among its siblings is a green line
 *  over a red fact. Those stay whole rows, and they break the run they were
 *  part of. */
function joinable(row: ToolRow): boolean {
  if (!GROUPABLE.has(row.kind)) return false
  if (row.status !== 'ok' && row.status !== 'running') return false
  // A call the reader had to approve is already separated: the approve card is
  // its own block, and a block boundary ends the ledger the run was in. There
  // is no `approved` flag on a row to check here, and inventing one to
  // re-separate what is already separate would be protocol for nothing.
  // A subagent's own rows nest under it; a group of nested rows would have to
  // own that nesting too, and the agent row above already summarizes them.
  return (row.children ?? []).length === 0
}

/** The last segment of a path, which is what a preview has room for. */
function shortName(target: string): string {
  const first = target.split(' ')[0] ?? target
  const at = first.lastIndexOf('/')
  return at === -1 ? first : first.slice(at + 1)
}

function previewOf(rows: readonly ToolRow[]): string {
  const names = rows.slice(0, NAMED_TARGETS).map((row) => shortName(row.target))
  const rest = rows.length - names.length
  return rest > 0 ? `${names.join(' · ')} +${rest}` : names.join(' · ')
}

/** Sums what the members' summaries said, when they said the same kind of
 *  thing.
 *
 *  Two shapes are worth summing and no others: lines read (`142L`) and diff
 *  counters (`+14 −3`). Anything else — `6 refs · 3 files`, `clean` — is not
 *  addable, and a summary that invented a total would be worse than none. */
function metaOf(rows: readonly ToolRow[]): string {
  let lines = 0
  let added = 0
  let removed = 0

  for (const row of rows) {
    const meta = row.meta ?? ''
    const read = /^(\d+)L$/.exec(meta.trim())
    if (read) lines += Number(read[1])
    for (const match of meta.matchAll(/([+−-])(\d+)/g)) {
      if (match[1] === '+') added += Number(match[2])
      else removed += Number(match[2])
    }
  }

  if (added > 0 || removed > 0) {
    const parts: string[] = []
    if (added > 0) parts.push(`+${added}`)
    if (removed > 0) parts.push(`−${removed}`)
    return parts.join(' ')
  }
  return lines > 0 ? `${lines}L` : ''
}

function groupOf(rows: ToolRow[]): RowGroup {
  return {
    kind: 'group',
    id: rows[0].id,
    tool: rows[0].kind,
    rows,
    preview: previewOf(rows),
    meta: metaOf(rows),
    // *Any* member still running, not merely the newest. Tools run in
    // parallel — pi's lsp tools are declared `parallel` — so a run can settle
    // its last call while an earlier one is still in flight, and a group that
    // collapsed then would hide the only call still happening.
    live: rows.some((row) => row.status === 'running'),
  }
}

/** A ledger's rows as the items the transcript draws.
 *
 *  Every row of the input appears in exactly one item, in order. That property
 *  is what makes this safe to slot in front of the existing renderer, and it
 *  is what the tests check first. */
export function groupRows(rows: readonly ToolRow[]): LedgerItem[] {
  const items: LedgerItem[] = []
  let run: ToolRow[] = []

  const flush = (): void => {
    if (run.length >= 2) items.push(groupOf(run))
    else for (const row of run) items.push({ kind: 'row', row })
    run = []
  }

  for (const row of rows) {
    if (!joinable(row)) {
      flush()
      items.push({ kind: 'row', row })
      continue
    }
    if (run.length > 0 && run[0].kind !== row.kind) flush()
    run.push(row)
  }
  flush()
  return items
}

/** Whether a group draws its members.
 *
 *  One function, because two things ask: the component that renders them and
 *  the stop list that decides where `j` can land. They disagreed once — a live
 *  group drew four rows that navigation could not reach, and leap could focus
 *  one, which left the ring on an id the list did not contain and threw it to
 *  the top of the thread on the next keystroke.
 *
 *  `live` is the *default*, not an override: while a run is in flight its
 *  group is open unless the reader shut it, and a reader who shuts one is
 *  obeyed. When the run ends the default goes back to closed, which is the
 *  collapse-on-finish the spec asks for. */
export function groupShown(group: RowGroup, chosen: (fallback: boolean) => boolean): boolean {
  return chosen(group.live)
}

/** The rows an item holds, in order — a group's members, or the one row. */
export function rowsOf(item: LedgerItem): ToolRow[] {
  return item.kind === 'group' ? item.rows : [item.row]
}
