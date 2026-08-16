import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { terminalId } from '../types'
import { terminals } from './terminal.svelte'
import { scrollColumn } from './columns'
import { preferences } from './preferences.svelte'
import { threads } from './threads.svelte'
import { newestCodeBlock } from '../thread'
/** How long after leaving TERM a second `esc` still means "send it through".
 *  Long enough to be deliberate, short enough that an unrelated later `esc`
 *  is not mistaken for the second half of a chord. */
const TERM_ESCAPE_WINDOW_MS = 350

import {
  type Action,
  type KeyEventLike,
  type KeyState,
  LEADER_TIMEOUT_MS,
  initialKeyState,
  reduceKey,
} from '../keyboard'

/** Keys that only ever modify another key. Pressing one is not an answer to
 *  anything, so a modal question must let them pass rather than read them as a
 *  decline. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
])

/** Focus targets the keyboard layer drives. Registered by the components that own
 *  the elements so the machine itself stays DOM-free. */
export interface FocusTargets {
  /** Any element the keyboard layer can hand the caret to. The composer is a
   *  textarea and the overlays are inputs; both only need focus and blur. */
  composer?: HTMLElement | null
  palette?: HTMLElement | null
  switcher?: HTMLElement | null
}

/** Bridges the pure key machine to app state, DOM focus and the leader timeout. */
class ShellState {
  overlay = $state<KeyState['overlay']>(initialKeyState.overlay)

  /** The thread waiting on a "close this running turn?" answer, if any. */
  pendingClose = $state<string | null>(null)

  readonly targets: FocusTargets = {}

  private leaderTimer: ReturnType<typeof setTimeout> | null = null
  #lastTermEscape = 0

  private get keyState(): KeyState {
    return { mode: app.mode, overlay: this.overlay }
  }

  closeOverlay(): void {
    this.overlay = null
  }

  openOverlay(overlay: KeyState['overlay']): void {
    this.overlay = overlay
    if (overlay === 'palette') queueMicrotask(() => this.targets.palette?.focus())
  }

  focusComposer(): void {
    queueMicrotask(() => this.targets.composer?.focus())
  }

  /** Creates a thread and hands it the caret, so leader-n leaves the person
   *  ready to type rather than looking at a new column they must still reach.
   *
   *  With nothing pinned there is no workspace to create it in, so the same
   *  keystroke starts the pin flow — the destination either way. */
  newThread(): void {
    if (catalog.source !== 'live') {
      void catalog.pin()
      return
    }

    const workspaceId = app.workspace.id
    void catalog.newThread(workspaceId).then((threadId) => {
      if (!threadId) return
      // The person may have moved on while the backend was working. The thread
      // is theirs either way, but stealing the caret back would be rude.
      if (app.workspace.id !== workspaceId) return

      const column = app.workspace.threads.findIndex((thread) => thread.id === threadId)
      if (column === -1) return

      app.focusThread(column)
      app.mode = 'INSERT'
      this.focusComposer()
    })
  }

  /** Closes the focused thread, asking first if a turn is running.
   *
   *  Closing cancels the turn, and a turn is work the person is waiting on, so
   *  a single keystroke must not throw it away. An idle thread has nothing to
   *  lose, so it closes at once. */
  requestClose(): void {
    const thread = app.thread
    // The fresh placeholder is not a thread; there is nothing to close.
    if (thread.fresh || thread.id === '') return

    if (thread.terminal) {
      // Closing kills the shell, so a command still running is worth one
      // question — the same bargain a running turn gets.
      const workspaceId = app.workspace.id
      void terminals.busy(workspaceId).then((busy) => {
        if (busy) this.pendingClose = thread.id
        else this.closeThread(thread.id, { cancelTurn: false })
      })
      return
    }

    if (threads.get(thread.id).runState === 'running') {
      this.pendingClose = thread.id
      return
    }
    this.closeThread(thread.id, { cancelTurn: false })
  }

  closeThread(threadId: string, { cancelTurn }: { cancelTurn: boolean }): void {
    const column = app.workspace.threads.find((candidate) => candidate.id === threadId)
    if (column?.terminal) {
      terminals.kill(app.workspace.id)
      catalog.closeColumn(threadId)
      return
    }

    if (cancelTurn) threads.cancel(threadId)
    catalog.closeThread(threadId)
  }

  /** Brings the workspace's shell up, or jumps to it if it is already there.
   *
   *  Landing in TERM is the point: a shell you asked for is a shell you meant
   *  to type into, the same reasoning that focuses the composer on leader-n. */
  openTerminal(): void {
    if (catalog.source !== 'live') return

    const workspaceId = app.workspace.id
    const id = terminalId(workspaceId)
    const existing = app.workspace.threads.findIndex((thread) => thread.id === id)

    if (existing !== -1) {
      app.focusThread(existing)
      app.mode = 'TERM'
      return
    }

    catalog.openTerminal(workspaceId)
    void terminals.create(workspaceId)

    const column = app.workspace.threads.findIndex((thread) => thread.id === id)
    if (column === -1) return
    app.focusThread(column)
    app.mode = 'TERM'
  }

  /** `esc` left TERM. A second one straight after means the person wanted the
   *  shell to see an escape — vim and lazygit both need one, and the mode key
   *  had already eaten it. */
  termEscape(): void {
    const now = Date.now()
    const since = now - this.#lastTermEscape
    // A negative gap is not a fast second press — it is a clock that moved
    // backwards. Treating it as one would send an escape nobody asked for.
    const doubled = since >= 0 && since < TERM_ESCAPE_WINDOW_MS
    this.#lastTermEscape = doubled ? 0 : now
    if (!doubled) return

    if (!app.thread.terminal) return
    terminals.write(app.workspace.id, '\u001b')
    app.mode = 'TERM'
  }

  /** Moves the focused column itself, rather than the focus. */
  moveColumn(delta: number): void {
    const from = app.threadIndex
    const to = from + delta
    if (to < 0 || to >= app.workspace.threads.length) return

    catalog.moveColumn(app.workspace.id, from, to)
    app.focusThread(to)
  }

  /** Returns true when the event was consumed and should be prevented. */
  handleKey(event: KeyEventLike): boolean {
    // A pending confirmation is modal: it is asked because the answer changes
    // what happens to work already in flight, so no other binding may run
    // underneath it. Only an explicit yes goes ahead; anything else backs out.
    if (this.pendingClose !== null) {
      // A modifier on its own is not an answer. Reaching for a capital must not
      // dismiss the question and leave the person unsure what they just did.
      if (MODIFIER_KEYS.has(event.key)) return false

      const confirmed = event.key === 'y' || event.key === 'Enter'
      const threadId = this.pendingClose
      this.pendingClose = null
      if (confirmed) this.closeThread(threadId, { cancelTurn: true })
      return true
    }

    const before = this.keyState
    const { state, actions, preventDefault, timer } = reduceKey(before, event, {
      workspaceCount: app.workspaces.length,
    })

    app.mode = state.mode
    this.overlay = state.overlay

    if (timer === 'clear') this.clearLeaderTimer()
    if (timer === 'start') this.startLeaderTimer()

    for (const action of actions) this.run(action)

    return preventDefault
  }

  private run(action: Action): void {
    switch (action.type) {
      case 'goWorkspace':
        app.goWorkspace(action.index)
        break
      case 'moveThread':
        app.moveThread(action.delta)
        break
      case 'scrollColumn':
        scrollColumn(app.thread.id, action.delta)
        break
      case 'focusComposer':
        // `i` means "start typing at the focused column". For a shell that is
        // TERM, not the composer — which is not even on screen.
        if (app.thread.terminal) app.mode = 'TERM'
        else this.focusComposer()
        break
      case 'blurComposer':
        this.targets.composer?.blur()
        break
      case 'focusPalette':
        queueMicrotask(() => this.targets.palette?.focus())
        break
      case 'focusSwitcher':
        queueMicrotask(() => this.targets.switcher?.focus())
        break
      case 'compact':
        threads.compact(app.thread.id)
        break
      case 'yank':
        void yankNewestCodeBlock()
        break
      case 'newThread':
        this.newThread()
        break
      case 'closeThread':
        this.requestClose()
        break
      case 'openTerminal':
        this.openTerminal()
        break
      case 'termEscape':
        this.termEscape()
        break
      case 'moveColumn':
        this.moveColumn(action.delta)
        break
      case 'pinWorkspace':
        // Failure lands on `catalog.error`, which the welcome screen renders.
        void catalog.pin()
        break
    }
  }

  private startLeaderTimer(): void {
    this.clearLeaderTimer()
    this.leaderTimer = setTimeout(() => {
      if (app.mode === 'LEADER') app.mode = 'NORMAL'
      this.leaderTimer = null
    }, preferences.leaderTimeoutMs)
  }

  private clearLeaderTimer(): void {
    if (this.leaderTimer === null) return
    clearTimeout(this.leaderTimer)
    this.leaderTimer = null
  }
}

/** Copies the focused thread's newest fenced block. A thread with no code is
 *  not an error — `y` simply has nothing to take, and says nothing. */
async function yankNewestCodeBlock(): Promise<void> {
  const code = newestCodeBlock(threads.get(app.thread.id).blocks)
  if (code === null) return

  try {
    await navigator.clipboard.writeText(code)
  } catch {
    // Clipboard access can be refused; losing a copy is not worth a crash.
  }
}

export const shell = new ShellState()
