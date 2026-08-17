/** What a thread's own checkout holds, and what taking it away would cost.
 *
 *  Held apart from the driver because none of it is about a session: the
 *  driver knows which directory a thread runs in, and every question here is
 *  about that directory rather than about the conversation inside it. */

import type { GitStatus } from '../../shared/protocol'
import { readStatus } from '../git/service'
import {
  listWorktrees,
  removeWorktree,
  repoOfWorktree,
  samePath,
  worktreeState,
} from '../git/worktree'
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

/** Every worktree a workspace has, and what each of them holds.
 *
 *  What the sweep lists. The state of each is read rather than remembered,
 *  because a worktree an agent has been working in all morning is not the one
 *  that was created this morning. */
export async function listWorkspaceWorktrees(
  workspaces: WorkspaceService,
  workspaceId: string,
): Promise<ThreadWorktree[]> {
  const root = workspaces.pathOf(workspaceId)
  const trees = await listWorktrees(root).catch(() => [])

  const ours = trees.filter((tree) => {
    const owner = repoOfWorktree(tree.path)
    return owner !== null && samePath(owner, root) && tree.branch !== null
  })

  return Promise.all(
    ours.map(async (tree) => ({
      branch: tree.branch as string,
      path: tree.path,
      ...(await worktreeState(tree.path)),
    })),
  )
}

/** Removes a worktree named by path, under the same three rules the close path
 *  uses. The sweep is a second door to the same room, not a way around it. */
export async function dropWorktreeAt(
  workspaces: WorkspaceService,
  workspaceId: string,
  path: string,
  force: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const root = workspaces.pathOf(workspaceId)
  const owner = repoOfWorktree(path)
  if (owner === null || !samePath(owner, root)) {
    return { ok: false, reason: 'not a worktree this workspace made' }
  }

  const state = await worktreeState(path)
  if (state.commits > 0) return { ok: false, reason: 'the branch holds commits' }
  if (state.dirty > 0 && !force) return { ok: false, reason: 'the worktree has uncommitted work' }

  try {
    await removeWorktree(root, path, { force })
    return { ok: true }
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
  }
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
