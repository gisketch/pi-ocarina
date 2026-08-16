import { BrowserWindow, ipcMain } from 'electron'
import {
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
  ptyChannel,
  type CommandName,
  type CommandParams,
  type EventBatch,
  type SessionDriver,
} from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'
import { createFinishNotifier } from '../lifecycle'
import { EventBatcher } from './batcher'
import { PiDriver } from './pi-driver'
import { StubDriver } from './stub-driver'
import { TerminalService } from './terminal'

function broadcast(batches: EventBatch[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(SESSION_EVENTS_CHANNEL, batches)
  }
}

/** Stands the session backend up and returns the driver so app shutdown can
 *  stop it cleanly. The stub is in place until the pi adapter lands; nothing
 *  above this function knows the difference. */
/** Terminal commands answer here rather than through the driver: a shell is
 *  not a session, and threading pty bytes through the same batcher would let a
 *  noisy build delay the tokens of every running thread. */
function registerTerminals(catalog: CatalogStore): TerminalService {
  const terminals = new TerminalService({
    emit: (workspaceId, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send(ptyChannel(workspaceId), data)
      }
    },
    cwdOf: (workspaceId) => {
      const workspace = catalog.workspace(workspaceId)
      if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`)
      return workspace.path
    },
  })

  ipcMain.handle('terminal:create', async (_event, workspaceId: string) => {
    await terminals.create(workspaceId)
    return { ok: true as const }
  })
  ipcMain.handle('terminal:kill', (_event, workspaceId: string) => {
    terminals.kill(workspaceId)
    return { ok: true as const }
  })
  ipcMain.on('terminal:write', (_event, workspaceId: string, data: string) => {
    terminals.write(workspaceId, data)
  })
  ipcMain.on('terminal:resize', (_event, workspaceId: string, cols: number, rows: number) => {
    terminals.resize(workspaceId, cols, rows)
  })
  ipcMain.handle('terminal:busy', (_event, workspaceId: string) => ({
    busy: terminals.busy(workspaceId),
  }))

  return terminals
}

export function registerSession(catalog: CatalogStore): {
  driver: SessionDriver
  terminals: TerminalService
} {
  const batcher = new EventBatcher(broadcast)
  const notifyFinished = createFinishNotifier()
  const emit = (threadId: string, event: Parameters<typeof batcher.push>[1]): void => {
    batcher.push(threadId, event)
    // Every event passes through here, which makes it the one place that can
    // tell when work finished while the user was looking elsewhere.
    notifyFinished(threadId, event)
  }

  const terminals = registerTerminals(catalog)

  // The stub stays available for seam work and demos; pi is the real backend.
  const driver: SessionDriver =
    process.env.PIOCARINA_DRIVER === 'stub'
      ? new StubDriver(emit)
      : new PiDriver({ emit, catalog, onUnpin: (id) => terminals.kill(id) })

  ipcMain.handle(
    SESSION_COMMAND_CHANNEL,
    async (_event, name: CommandName, params: CommandParams<CommandName>) => {
      try {
        return await driver.execute(name, params)
      } catch (error) {
        // Surface the reason to the caller's promise; the UI decides what to say.
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`session command "${name}" failed: ${reason}`)
      }
    },
  )

  return { driver, terminals }
}
