import { BrowserWindow, ipcMain } from 'electron'
import { GIT_STATUS_CHANNEL, type GitStatusMessage } from '../../shared/protocol'
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

  // What a window that opened late asks for, so it draws the state already
  // read rather than an empty branch until something changes.
  ipcMain.handle('git:statuses', () => git.statuses())

  return git
}
