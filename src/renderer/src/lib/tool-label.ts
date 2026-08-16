/** What a row calls itself, which depends on where its call has got to.
 *
 *  A ledger that says `edit` from the moment a call starts until long after it
 *  finished is telling the reader the kind of the call and nothing about it. The
 *  pulsing node says something is live, but only if you are watching the spine
 *  rather than reading the words.
 *
 *  A table rather than a rule. English does not conjugate by pattern —
 *  `write → wrote`, `read → read` — and a rule that got `writed` would be worse
 *  than no tense at all. */

import type { ToolKind, ToolStatus } from '../../../shared/vocabulary'

interface Tense {
  /** While the call is in flight. */
  running: string
  /** After it succeeded. */
  done: string
}

const TENSES: Record<ToolKind, Tense> = {
  read: { running: 'reading', done: 'read' },
  grep: { running: 'grepping', done: 'grepped' },
  write: { running: 'writing', done: 'wrote' },
  edit: { running: 'editing', done: 'edited' },
  bash: { running: 'running', done: 'ran' },
  fetch: { running: 'fetching', done: 'fetched' },
  todo: { running: 'listing', done: 'todo' },
  skill: { running: 'loading', done: 'skill' },
  agent: { running: 'working', done: 'agent' },
  raw: { running: 'running', done: 'tool' },
}

/** What the row's gutter reads.
 *
 *  Only a call that ran to completion gets the past tense. A denied call did not
 *  edit anything, and `edited` next to a red node would contradict itself — so a
 *  call that ended any other way falls back to the bare kind, and the status
 *  beside it says what became of it. */
export function labelFor(kind: ToolKind, status: ToolStatus): string {
  const tense = TENSES[kind]
  if (!tense) return kind

  if (status === 'running') return tense.running
  if (status === 'ok') return tense.done
  return kind
}

/** The longest label a ledger holding these kinds could ever show.
 *
 *  Every label a kind can take, not the one it happens to be wearing: sizing to
 *  the current text would pull every target sideways the moment `editing`
 *  became `edited`.
 *
 *  Counted in characters rather than measured in pixels. The gutter is
 *  monospaced, so a character is a unit of width — and a real measurement would
 *  mean reading a rect per ledger, which forces layout on the very elements the
 *  transcript's `content-visibility` is there to keep unlaid. */
export function widestLabel(kinds: Iterable<ToolKind>): number {
  let widest = 0
  for (const kind of kinds) {
    const tense = TENSES[kind]
    if (!tense) continue
    widest = Math.max(widest, tense.running.length, tense.done.length, kind.length)
  }
  return widest
}
