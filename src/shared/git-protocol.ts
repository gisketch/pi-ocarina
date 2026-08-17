/** The git half of the seam.
 *
 *  Held apart from the rest of the protocol because it is answered on its own
 *  channel: a repository is not a session, and a status read must not queue
 *  behind a streaming turn. */

export interface GitStatus {
  /** Branch name, or the short commit when HEAD is detached. */
  branch: string
  detached: boolean
  ahead: number
  behind: number
  /** Files staged as new. Untracked files are counted separately, because the
   *  parse should not decide whether they are "added" — the summary does. */
  added: number
  modified: number
  deleted: number
  untracked: number
  /** Unmerged paths. Any non-zero value means the repo is mid-merge. */
  conflicts: number
}

/** One file the commit card lists. Counts are lines; null means git could not
 *  count them, which is what it says about a binary file. */
export interface GitChange {
  path: string
  status: 'M' | 'A' | 'D'
  added: number | null
  removed: number | null
}

/** What the card opens with: what would be committed, and a message to start
 *  from. */
export interface GitCommitDraft {
  changes: GitChange[]
  message: string
  /** Whether the repository has a remote to push to. Answered with the draft
   *  so the card can say why pushing is unavailable before the commit, rather
   *  than failing at the push afterwards. */
  remote: boolean
}

/** Commit reports its two halves apart: a commit survives a failed push, and
 *  saying the commit failed would send someone looking for work already
 *  saved. */
export type GitCommitResult =
  | { ok: true; pushed: boolean }
  | { ok: false; stage: 'commit' | 'push'; reason: string }

/** A workspace's repository state, or null when the folder is not a repo. */
/** What the commit card's pull request action came back with. `url` is null
 *  when the push succeeded but no page could be worked out — the branch is
 *  pushed either way. */
export type PullRequestResult =
  | { ok: true; url: string | null; branch: string }
  | { ok: false; reason: string }

export interface GitStatusMessage {
  workspaceId: string
  status: GitStatus | null
}

/** What the backend says happened. The reducer turns these into blocks. */
