import { BrowserWindow, ipcMain } from 'electron'
import {
  GIT_STATUS_CHANNEL,
  type GitCommitDraft,
  type GitCommitResult,
  type GitStatusMessage,
  type PullRequestResult,
} from '../../shared/protocol'
import { commitAll, hasRemote, proposeMessage, pushCommits, readChanges } from './commit'
import { pushBranch } from './pull-request'
import type { CatalogStore } from '../catalog-store'
import { GitService } from './service'

export { GitService } from './service'

/** Stands the git pipeline up.
 *
 *  Git answers on its own channel rather than through the session driver: a
 *  repository is not a session, and a status read must not queue behind a
 *  streaming turn. */
export interface GitWiring {
  /** Where a thread runs, when it runs somewhere other than its workspace.
   *  Null for a thread in the workspace's own folder, and for a thread this
   *  process has never opened. */
  cwdOfThread?: (threadId: string) => string | null
  /** The branch a thread is isolated on, or null. */
  branchOfThread?: (threadId: string) => string | null
}

export function registerGit(catalog: CatalogStore, wiring: GitWiring = {}): GitService {
  const git = new GitService({
    pathOf: (workspaceId) => catalog.workspace(workspaceId)?.path ?? null,
    emit: (workspaceId, status) => {
      const message: GitStatusMessage = { workspaceId, status }
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send(GIT_STATUS_CHANNEL, message)
      }
    },
  })

  // Fire-and-forget: the answer arrives on the channel, so a renderer that
  // asks about six workspaces does not wait on six git processes.
  ipcMain.on('git:refresh', (_event, workspaceId: string) => git.refresh(workspaceId))

  /** The folder a card is about.
   *
   *  A thread with its own checkout is asked about that checkout, not about the
   *  workspace: a card that listed one tree and committed in another would be
   *  worse than no card. */
  const pathOf = (workspaceId: string, threadId?: string): string => {
    const isolated = threadId === undefined ? null : (wiring.cwdOfThread?.(threadId) ?? null)
    if (isolated) return isolated

    const path = catalog.workspace(workspaceId)?.path
    if (!path) throw new Error(`unknown workspace: ${workspaceId}`)
    return path
  }

  ipcMain.handle(
    'git:changes',
    async (_event, workspaceId: string, threadId?: string): Promise<GitCommitDraft> => {
      const cwd = pathOf(workspaceId, threadId)
      const [changes, remote] = await Promise.all([readChanges(cwd), hasRemote(cwd)])
      return { changes, message: proposeMessage(changes), remote }
    },
  )

  // The card never commits by itself: this runs because a person pressed the
  // key that says what it does.
  ipcMain.handle(
    'git:commit',
    async (
      _event,
      workspaceId: string,
      options: { message: string; paths: string[]; push: boolean; threadId?: string },
    ): Promise<GitCommitResult> => {
      const result = await commitAll(pathOf(workspaceId, options.threadId), options)
      // The status bar is stale the moment a commit lands.
      git.refresh(workspaceId)
      return result
    },
  )

  ipcMain.handle(
    'git:push',
    async (_event, workspaceId: string, threadId?: string): Promise<GitCommitResult> => {
      const result = await pushCommits(pathOf(workspaceId, threadId))
      git.refresh(workspaceId)
      return result
    },
  )

  /** Pushes an isolated thread's branch and says where its pull request lives.
   *
   *  Only for a thread with a branch of its own: pushing the workspace's branch
   *  is what `git:push` is, and this one names a branch the reader chose. */
  ipcMain.handle(
    'git:pullRequest',
    async (_event, workspaceId: string, threadId: string): Promise<PullRequestResult> => {
      const branch = wiring.branchOfThread?.(threadId) ?? null
      if (!branch) return { ok: false, reason: 'this thread is not on a branch of its own' }

      const result = await pushBranch(pathOf(workspaceId, threadId), branch)
      git.refresh(workspaceId)
      return result.ok ? { ok: true, url: result.url, branch } : result
    },
  )

  // What a window that opened late asks for, so it draws the state already
  // read rather than an empty branch until something changes.
  ipcMain.handle('git:statuses', () => git.statuses())

  return git
}
