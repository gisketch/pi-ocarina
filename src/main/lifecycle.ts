import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import type { UiEvent } from '../shared/protocol'
import { quitMessage } from '../shared/quit'

/** What the app needs to know about work in flight before it closes anything. */
export interface RunningWork {
  runningThreads(): string[]
  abortAll(): Promise<void>
}

/** Whether a finished thread deserves interrupting the user for.
 *
 *  Only when they are not already looking at the app, and only when the thread
 *  was actually running: reopening a thread replays its history and ends on
 *  `done` too, and announcing that would be a notification for something the
 *  user just did themselves. */
export function shouldNotify(event: UiEvent, focused: boolean, wasRunning: boolean): boolean {
  if (focused || !wasRunning) return false
  if (event.kind !== 'thread-state') return false
  return event.state === 'done' || event.state === 'failed'
}

/** Remembers which threads are mid-turn.
 *
 *  Instantiated rather than global so each app run — and each test — starts
 *  with an empty memory instead of inheriting the last one's. */
export function createRunningTracker(): (threadId: string, event: UiEvent) => boolean {
  const running = new Set<string>()

  return (threadId, event) => {
    if (event.kind !== 'thread-state') return running.has(threadId)

    const wasRunning = running.has(threadId)
    if (event.state === 'running') running.add(threadId)
    else running.delete(threadId)
    return wasRunning
  }
}

/** How long the app waits for the renderer's own modal before falling back to
 *  a native dialog. Long enough for a paint, short enough that a wedged
 *  renderer cannot make the app unquittable. */
const ANSWER_TIMEOUT_MS = 5000

/** Builds the hook that raises a native notification for work that finished out
 *  of sight. One per app run; it carries the running-thread memory. */
export function createFinishNotifier(): (threadId: string, event: UiEvent) => void {
  const wasRunningBefore = createRunningTracker()

  return (threadId, event) => {
    const wasRunning = wasRunningBefore(threadId, event)
    const focused = BrowserWindow.getAllWindows().some((win) => win.isFocused())
    if (!shouldNotify(event, focused, wasRunning) || !Notification.isSupported()) return
    if (event.kind !== 'thread-state') return

    new Notification({
      title: event.state === 'failed' ? 'Thread failed' : 'Thread finished',
      body: event.state === 'failed' ? (event.reason ?? threadId) : threadId,
    }).show()
  }
}

/** Closing the window puts the app away; it does not stop the agents.
 *
 *  Only on macOS, where an app without windows is still running and reachable
 *  from the dock. Elsewhere a hidden window with no tray icon would be a way to
 *  lose the app entirely. */
export function holdWindowOpen(win: BrowserWindow, isQuitting: () => boolean): void {
  if (process.platform !== 'darwin') return

  win.on('close', (event) => {
    if (isQuitting()) return
    event.preventDefault()
    win.hide()
  })
}

/** Makes quitting wait for an answer when threads are still working, then stops
 *  them cleanly so pi's session files are never left mid-write. */
export function registerLifecycle(work: RunningWork): { isQuitting: () => boolean } {
  let quitting = false

  app.on('before-quit', (event) => {
    if (quitting) return

    const running = work.runningThreads()
    if (running.length === 0) {
      quitting = true
      return
    }

    event.preventDefault()
    void confirmThenQuit(work, running.length, () => {
      quitting = true
    })
  })

  return { isQuitting: () => quitting }
}

async function confirmThenQuit(
  work: RunningWork,
  running: number,
  markQuitting: () => void,
): Promise<void> {
  const confirmed = (await askRenderer(running)) ?? (await askNatively(running))
  if (!confirmed) return

  markQuitting()
  await work.abortAll()
  app.quit()
}

/** Asks in the app's own confirm modal, which is where every other
 *  destructive question is asked.
 *
 *  Null means it could not be asked — no visible window, or a renderer that
 *  did not answer in time. A wedged renderer must not make the app
 *  unquittable, so that case falls through to the platform dialog rather than
 *  waiting forever. */
function askRenderer(running: number): Promise<boolean | null> {
  const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (!win || !win.isVisible()) return Promise.resolve(null)

  return new Promise<boolean | null>((resolve) => {
    const answer = (_event: unknown, ok: boolean): void => {
      clearTimeout(timer)
      resolve(Boolean(ok))
    }
    const timer = setTimeout(() => {
      ipcMain.off('lifecycle:quit-answer', answer)
      // Take the question back before asking it again natively: two copies of
      // the same question on screen is worse than one, and an answer to the
      // abandoned one would go nowhere.
      if (!win.isDestroyed()) win.webContents.send('lifecycle:withdraw-quit')
      resolve(null)
    }, ANSWER_TIMEOUT_MS)

    ipcMain.once('lifecycle:quit-answer', answer)
    win.webContents.send('lifecycle:confirm-quit', running)
  })
}

async function askNatively(running: number): Promise<boolean> {
  const { message, detail } = quitMessage(running)
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Quit anyway'],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  })
  return response === 1
}
