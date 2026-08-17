/** The five commands that are about a checkout rather than a conversation.
 *
 *  Answered here rather than in the driver because none of them touches a
 *  session: they ask a workspace where a thread runs, and ask git the rest. */

import type { CommandName, CommandParams } from '../../shared/protocol'
import {
  dropWorktree,
  dropWorktreeAt,
  listWorkspaceWorktrees,
  threadGitStatus,
  worktreeOf,
} from './thread-worktree'
import type { WorkspaceService } from './workspaces'

/** The names this module answers. */
export type WorktreeCommand =
  | 'threadWorktree'
  | 'removeThreadWorktree'
  | 'listWorktrees'
  | 'removeWorktree'
  | 'threadGit'

export async function worktreeCommand(
  workspaces: WorkspaceService,
  name: CommandName,
  params: unknown,
): Promise<unknown> {
  switch (name as WorktreeCommand) {
    case 'threadWorktree': {
      const { threadId } = params as CommandParams<'threadWorktree'>
      return { worktree: await worktreeOf(workspaces, threadId) }
    }

    case 'removeThreadWorktree': {
      const { threadId, force } = params as CommandParams<'removeThreadWorktree'>
      return dropWorktree(workspaces, threadId, force ?? false)
    }

    case 'listWorktrees': {
      const { workspaceId } = params as CommandParams<'listWorktrees'>
      return { worktrees: await listWorkspaceWorktrees(workspaces, workspaceId) }
    }

    case 'removeWorktree': {
      const { workspaceId, path, force } = params as CommandParams<'removeWorktree'>
      return dropWorktreeAt(workspaces, workspaceId, path, force ?? false)
    }

    case 'threadGit': {
      const { threadId } = params as CommandParams<'threadGit'>
      return { status: await threadGitStatus(workspaces, threadId) }
    }
  }
}
