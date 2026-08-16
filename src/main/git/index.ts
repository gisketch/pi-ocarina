import { BrowserWindow, ipcMain } from 'electron'
import {
  GIT_STATUS_CHANNEL,
  type GitCommitDraft,
  type GitCommitResult,
  type GitStatusMessage,
} from '../../shared/protocol'
import { commitAll, proposeMessage, pushCommits, readChanges } from './commit'
import type { CatalogStore } from '../catalog-store'
import { GitService } from './service'

export { GitService } from './service'

/** Stands the git pipeline up.
 *
 *  Git answers on its own channel rather than through the session driver: a
 *  repository is not a session, and a status read must not queue behind a
 *  streaming turn. */
export function registerGit(catalog: CatalogStore): GitService {
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

  const pathOf = (workspaceId: string): string => {
    const path = catalog.workspace(workspaceId)?.path
    if (!path) throw new Error(`unknown workspace: ${workspaceId}`)
    return path
  }

  ipcMain.handle('git:changes', async (_event, workspaceId: string): Promise<GitCommitDraft> => {
    const changes = await readChanges(pathOf(workspaceId))
    return { changes, message: proposeMessage(changes) }
  })

  // The card never commits by itself: this runs because a person pressed the
  // key that says what it does.
  ipcMain.handle(
    'git:commit',
    async (
      _event,
      workspaceId: string,
      options: { message: string; push: boolean },
    ): Promise<GitCommitResult> => {
      const result = await commitAll(pathOf(workspaceId), options)
      // The status bar is stale the moment a commit lands.
      git.refresh(workspaceId)
      return result
    },
  )

  ipcMain.handle('git:push', async (_event, workspaceId: string): Promise<GitCommitResult> => {
    const result = await pushCommits(pathOf(workspaceId))
    git.refresh(workspaceId)
    return result
  })

  // What a window that opened late asks for, so it draws the state already
  // read rather than an empty branch until something changes.
  ipcMain.handle('git:statuses', () => git.statuses())

  return git
}
