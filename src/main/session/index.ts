import { BrowserWindow, ipcMain } from 'electron'
import {
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
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

function broadcast(batches: EventBatch[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(SESSION_EVENTS_CHANNEL, batches)
  }
}

/** Stands the session backend up and returns the driver so app shutdown can
 *  stop it cleanly. The stub is in place until the pi adapter lands; nothing
 *  above this function knows the difference. */
export function registerSession(catalog: CatalogStore): SessionDriver {
  const batcher = new EventBatcher(broadcast)
  const notifyFinished = createFinishNotifier()
  const emit = (threadId: string, event: Parameters<typeof batcher.push>[1]): void => {
    batcher.push(threadId, event)
    // Every event passes through here, which makes it the one place that can
    // tell when work finished while the user was looking elsewhere.
    notifyFinished(threadId, event)
  }

  // The stub stays available for seam work and demos; pi is the real backend.
  const driver: SessionDriver =
    process.env.PIOCARINA_DRIVER === 'stub' ? new StubDriver(emit) : new PiDriver({ emit, catalog })

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

  return driver
}
