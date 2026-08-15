import { app, BrowserWindow, dialog, Notification } from 'electron'
import type { UiEvent } from '../shared/protocol'

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

export function quitMessage(running: number): { message: string; detail: string } {
  const threads = running === 1 ? 'thread is' : 'threads are'
  return {
    message: `${running} ${threads} still working.`,
    detail: 'Quitting stops them. Their transcripts are saved either way.',
  }
}

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
  const { message, detail } = quitMessage(running)
  // A native dialog for now; the design's own confirm modal replaces this when
  // the renderer grows one.
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Quit anyway'],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  })

  if (response !== 1) return

  markQuitting()
  await work.abortAll()
  app.quit()
}
