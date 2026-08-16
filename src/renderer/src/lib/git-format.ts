import type { GitStatus } from '../../../shared/protocol'

/** How a segment is coloured. The palette names, not the colours. */
export type GitTone = 'ok' | 'warn' | 'bad'

export interface GitSegment {
  text: string
  tone: GitTone
}

/** The compact summary next to a branch name.
 *
 *  The grammar is the reference's: `↑1` ahead, `↓1` behind, `+1` new, `~1`
 *  modified, `-1` deleted, `!2 conflicts`, `✓ clean`. Counts are files.
 *
 *  Two rules keep it short enough to read at a glance. A count of zero is left
 *  out entirely — a row of zeros reads as a measurement nobody needs. And a
 *  repository mid-merge shows its conflicts instead of its counts: while a
 *  merge is unresolved, how many files are also modified is not the thing to
 *  act on. */
export function summarize(status: GitStatus | null): GitSegment[] {
  if (!status) return []

  const segments: GitSegment[] = []
  if (status.ahead > 0) segments.push({ text: `↑${status.ahead}`, tone: 'warn' })
  if (status.behind > 0) segments.push({ text: `↓${status.behind}`, tone: 'warn' })

  if (status.conflicts > 0) {
    const word = status.conflicts === 1 ? 'conflict' : 'conflicts'
    segments.push({ text: `!${status.conflicts} ${word}`, tone: 'bad' })
    return segments
  }

  const added = status.added + status.untracked
  if (added > 0) segments.push({ text: `+${added}`, tone: 'ok' })
  if (status.modified > 0) segments.push({ text: `~${status.modified}`, tone: 'warn' })
  if (status.deleted > 0) segments.push({ text: `-${status.deleted}`, tone: 'bad' })

  // Said only when the working tree is genuinely clean. Being ahead of the
  // remote is not dirt, so `↑1 ✓ clean` is an honest thing to show.
  if (added + status.modified + status.deleted === 0) {
    segments.push({ text: '✓ clean', tone: 'ok' })
  }

  return segments
}

/** What the branch segment says. A detached HEAD shows its commit, prefixed so
 *  it cannot be mistaken for a branch of that name. */
export function branchLabel(status: GitStatus | null): string {
  if (!status) return ''
  return status.detached ? `@${status.branch}` : status.branch
}
