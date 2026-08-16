import type { GitStatus } from '../../shared/protocol'

/** A repo nobody has looked at yet: every count zero, no branch. */
export const EMPTY_STATUS: GitStatus = Object.freeze({
  branch: '',
  detached: false,
  ahead: 0,
  behind: 0,
  added: 0,
  modified: 0,
  deleted: 0,
  untracked: 0,
  conflicts: 0,
})

/** What `git` prints for a HEAD that is not on a branch. */
const DETACHED = '(detached)'

/** Reads `git status --porcelain=v2 --branch`.
 *
 *  Porcelain v2 is the only status format git promises not to change, which is
 *  why it is worth parsing by hand rather than reading the human output. Every
 *  line is `<prefix> <rest>`, and a prefix this parser does not know is skipped
 *  rather than guessed at — a future git that adds one must not change counts.
 *
 *  Paths are never read, so a filename with a space or a quote costs nothing:
 *  git keeps one entry per line, and only the status letters are inspected. */
export function parseStatus(stdout: string): GitStatus {
  const status: GitStatus = { ...EMPTY_STATUS }

  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    const prefix = line[0]

    if (prefix === '#') readHeader(line, status)
    else if (prefix === '1' || prefix === '2') countEntry(line.slice(2, 4), status)
    else if (prefix === 'u') status.conflicts += 1
    else if (prefix === '?') status.untracked += 1
    // '!' is an ignored file, which is not a change; anything else is unknown.
  }

  return status
}

function readHeader(line: string, status: GitStatus): void {
  const [, field, ...rest] = line.split(' ')

  if (field === 'branch.head') {
    const head = rest[0] ?? ''
    // The branch name is filled in from the oid below when HEAD is detached,
    // so that the chrome shows the commit rather than the word "(detached)".
    if (head === DETACHED) status.detached = true
    else status.branch = head
    return
  }

  if (field === 'branch.oid' && status.branch === '') {
    // Headers arrive oid-first, so this runs before `branch.head` and is
    // overwritten for a normal branch. A detached HEAD keeps the short commit.
    status.branch = (rest[0] ?? '').slice(0, 7)
    return
  }

  if (field === 'branch.ab') {
    status.ahead = Math.abs(signed(rest[0]))
    status.behind = Math.abs(signed(rest[1]))
  }
}

function signed(token: string | undefined): number {
  const value = Number.parseInt(token ?? '', 10)
  return Number.isFinite(value) ? value : 0
}

/** Counts one changed file from its two status letters.
 *
 *  `XY` is index status then worktree status. A file can be both — staged as
 *  added and then edited again — and is counted once, under the strongest
 *  thing that happened to it: deleted, then added, then modified. Counting it
 *  twice would report more changed files than the repo has. */
function countEntry(xy: string, status: GitStatus): void {
  const index = xy[0] ?? '.'
  const worktree = xy[1] ?? '.'

  if (index === 'D' || worktree === 'D') status.deleted += 1
  else if (index === 'A') status.added += 1
  else if (index !== '.' || worktree !== '.') status.modified += 1
}
