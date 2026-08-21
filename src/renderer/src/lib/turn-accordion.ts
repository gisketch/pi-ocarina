/** One row per finished turn.
 *
 *  The transcript's second projection (turn-accordion spec). `groupRows`
 *  collapses runs of calls inside a ledger; this collapses the whole of a
 *  turn's work behind one `worked for 1m39s ›` row, leaving the user's
 *  message and the turn's final answer outside. Like grouping, it is a
 *  projection and nothing else: every block keeps its id, its contents and
 *  its order, and the session log never hears about it. */

import type { Block, ThreadRunState, TurnSpan } from './thread'

export type TurnItem =
  /** A block outside any turn: everything before the first user message. */
  | { kind: 'block'; block: Block }
  | {
      kind: 'turn'
      /** The opening user block's id — stable, and what the collapse state
       *  and the span registry key on. */
      id: string
      opener: Block
      /** Everything the turn did on the way to its answer. What the
       *  accordion hides. */
      inner: Block[]
      /** The trailing run of agent messages — the answer. Always visible. */
      final: Block[]
    }

/** Separators a final run may reach past: they draw nothing. */
const INVISIBLE: ReadonlySet<Block['kind']> = new Set(['checkpoint'])

/** Splits a turn's non-opener blocks into the work and the answer.
 *
 *  The answer is the trailing contiguous run of `agent` blocks, looking past
 *  blocks that draw nothing. Anything before it — and any agent message with
 *  work after it — is inner: an agent that spoke, worked, then spoke again
 *  said two things, and only the second is the answer (same rule as
 *  `turnMessage`). */
function split(blocks: Block[]): { inner: Block[]; final: Block[] } {
  let start = blocks.length
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const kind = blocks[index].kind
    if (INVISIBLE.has(kind)) continue
    if (kind !== 'agent') break
    start = index
  }
  return { inner: blocks.slice(0, start), final: blocks.slice(start) }
}

/** A thread's blocks, partitioned into turns.
 *
 *  Every input block appears in exactly one item, in order — the invariant
 *  that makes this safe to slot in front of the renderer, and the first
 *  thing the tests check. A new turn starts at every `user` block: a turn is
 *  everything since the last thing the user said. */
export function turnsOf(blocks: Block[]): TurnItem[] {
  const items: TurnItem[] = []
  let opener: Block | null = null
  let run: Block[] = []

  const flush = (): void => {
    if (opener === null) return
    const { inner, final } = split(run)
    items.push({ kind: 'turn', id: opener.id, opener, inner, final })
    run = []
  }

  for (const block of blocks) {
    if (block.kind === 'user') {
      flush()
      opener = block
      continue
    }
    if (opener === null) items.push({ kind: 'block', block })
    else run.push(block)
  }
  flush()
  return items
}

/** Whether this turn is over.
 *
 *  Only the newest turn can be running, and only while the thread itself is:
 *  everything above it is history, however the thread is doing now. */
export function turnResolved(turn: TurnItem & { kind: 'turn' }, lastTurnId: string | null, runState: ThreadRunState): boolean {
  if (turn.id !== lastTurnId) return true
  return runState !== 'running' && runState !== 'waiting-input'
}

/** A gate still waiting on the reader, anywhere in the turn's work.
 *
 *  A pending ask or approval inside a closed accordion is a deadlock: the
 *  turn cannot move and the reader cannot see why. It forces the accordion
 *  open, over every default and every remembered choice. */
export function hasPendingGate(turn: TurnItem & { kind: 'turn' }): boolean {
  return turn.inner.some(
    (block) =>
      (block.kind === 'ask' || block.kind === 'approve') && block.outcome === undefined,
  )
}

/** Whether an accordion draws its work — the `groupShown` contract, plus the
 *  gate override. Unresolved defaults open, resolved defaults closed, the
 *  reader's choice wins over both; a pending gate wins over everything. */
export function accordionShown(
  turn: TurnItem & { kind: 'turn' },
  resolved: boolean,
  chosen: (fallback: boolean) => boolean,
): boolean {
  if (hasPendingGate(turn)) return true
  return chosen(!resolved)
}

/** What the collapsed row says. `took` is already formatted (`1m39s`) —
 *  formatting is the caller's, because a running label re-renders on a clock
 *  this module must not own. Absent `took` means the turn was replayed from
 *  the session log, which records what was said and not how long it took. */
export function accordionLabel(took: string | null, outcome: TurnSpan['outcome'] | 'running'): string {
  if (took === null) return 'worked'
  if (outcome === 'running') return `working for ${took}`
  if (outcome === 'failed') return `stopped after ${took}`
  if (outcome === 'stopped') return `interrupted after ${took}`
  return `worked for ${took}`
}

/** The blocks an item holds, in order — the projection invariant's witness. */
export function blocksOf(item: TurnItem): Block[] {
  return item.kind === 'block' ? [item.block] : [item.opener, ...item.inner, ...item.final]
}

/** Whether a turn draws a header row at all. One function because two
 *  callers ask — the component that draws it and the stop list that lets `j`
 *  land on it — and a header drawn but not a stop is a ring that skips a
 *  visible row. A resolved turn with no work has nothing to hide and no
 *  clock worth a row; an unresolved one shows the turn began, before any
 *  work exists. */
export function accordionDrawn(turn: TurnItem & { kind: 'turn' }, resolved: boolean): boolean {
  return turn.inner.length > 0 || !resolved
}

/** Where an accordion registers, and what its open state is keyed on. One
 *  function so the stop list and the component cannot disagree — the same
 *  seam `groupNavId` is, for the same reason. */
export function accordionNavId(turnId: string): string {
  return `accordion:${turnId}`
}

/** The newest turn's id — the only one that can be running. */
export function lastTurnIdOf(blocks: Block[]): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.kind === 'user') return block.id
  }
  return null
}
