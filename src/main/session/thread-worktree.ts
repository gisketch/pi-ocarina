/** What a thread's own checkout holds, and what taking it away would cost.
 *
 *  Held apart from the driver because none of it is about a session: the
 *  driver knows which directory a thread runs in, and every question here is
 *  about that directory rather than about the conversation inside it. */

import type { GitStatus } from '../../shared/protocol'
import { readStatus } from '../git/service'
import { removeWorktree, repoOfWorktree, worktreeState } from '../git/worktree'
import type { WorkspaceService } from './workspaces'

export interface ThreadWorktree {
  branch: string
  path: string
  /** Files changed and not committed. */
  dirty: number
  /** Commits on this branch and nowhere else. */
  commits: number
}

/** A thread's worktree, or null when it runs in the workspace's own folder. */
export async function worktreeOf(
  workspaces: WorkspaceService,
  threadId: string,
): Promise<ThreadWorktree | null> {
  const branch = workspaces.branchOf(threadId)
  const path = workspaces.cwdOf(threadId)
  if (branch === null || path === undefined) return null

  return { branch, path, ...(await worktreeState(path)) }
}

/** An isolated thread's own repository state.
 *
 *  A thread in the workspace's folder answers null, because that state already
 *  reaches the chrome on the git channel and a second source would let the two
 *  disagree about the same repository. */
export async function threadGitStatus(
  workspaces: WorkspaceService,
  threadId: string,
): Promise<GitStatus | null> {
  const branch = workspaces.branchOf(threadId)
  const cwd = workspaces.cwdOf(threadId)
  if (branch === null || cwd === undefined) return null

  return readStatus(cwd)
}

/** Takes a thread's worktree away.
 *
 *  Commits are refused here rather than in the renderer, because this is the
 *  side that can see them: a reader looking at a clean column has no way to
 *  know that its branch is where the last hour of work lives. Uncommitted work
 *  is refused too, until `force` says the reader was asked and answered. */
export async function dropWorktree(
  workspaces: WorkspaceService,
  threadId: string,
  force: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const found = await worktreeOf(workspaces, threadId)
  if (!found) return { ok: true }
  if (found.commits > 0) return { ok: false, reason: 'the branch holds commits' }
  if (found.dirty > 0 && !force) return { ok: false, reason: 'the worktree has uncommitted work' }

  const repo = repoOfWorktree(found.path)
  if (repo === null) return { ok: false, reason: 'not a worktree this app made' }

  try {
    await removeWorktree(repo, found.path, { force })
    return { ok: true }
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
  }
}
