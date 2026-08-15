import { BrowserWindow, ipcMain } from 'electron'
import {
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
  type CommandName,
  type CommandParams,
  type EventBatch,
  type SessionDriver,
} from '../../shared/protocol'
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
export function registerSession(): SessionDriver {
  const batcher = new EventBatcher(broadcast)
  const emit = (threadId: string, event: Parameters<typeof batcher.push>[1]): void =>
    batcher.push(threadId, event)

  // The stub stays available for seam work and demos; pi is the real backend.
  const driver: SessionDriver =
    process.env.PIOCARINA_DRIVER === 'stub'
      ? new StubDriver(emit)
      : new PiDriver({ emit, resolveWorkspace: () => process.cwd() })

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
