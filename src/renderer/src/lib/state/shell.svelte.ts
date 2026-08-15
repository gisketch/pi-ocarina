import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { scrollColumn } from './columns'
import { preferences } from './preferences.svelte'
import { threads } from './threads.svelte'
import { newestCodeBlock } from '../thread'
import {
  type Action,
  type KeyEventLike,
  type KeyState,
  LEADER_TIMEOUT_MS,
  initialKeyState,
  reduceKey,
} from '../keyboard'

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
  terminal = $state(initialKeyState.terminal)

  /** The thread waiting on a "close this running turn?" answer, if any. */
  pendingClose = $state<string | null>(null)

  readonly targets: FocusTargets = {}

  private leaderTimer: ReturnType<typeof setTimeout> | null = null

  private get keyState(): KeyState {
    return { mode: app.mode, overlay: this.overlay, terminal: this.terminal }
  }

  closeOverlay(): void {
    this.overlay = null
  }

  openOverlay(overlay: KeyState['overlay']): void {
    this.overlay = overlay
    if (overlay === 'palette') queueMicrotask(() => this.targets.palette?.focus())
  }

  toggleTerminal(): void {
    this.terminal = !this.terminal
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

    if (threads.get(thread.id).runState === 'running') {
      this.pendingClose = thread.id
      return
    }
    this.closeThread(thread.id, { cancelTurn: false })
  }

  closeThread(threadId: string, { cancelTurn }: { cancelTurn: boolean }): void {
    if (cancelTurn) threads.cancel(threadId)
    catalog.closeThread(threadId)
  }

  /** Returns true when the event was consumed and should be prevented. */
  handleKey(event: KeyEventLike): boolean {
    // A pending confirmation is modal: it is asked because the answer changes
    // what happens to work already in flight, so no other binding may run
    // underneath it. Only an explicit yes goes ahead; anything else backs out.
    if (this.pendingClose !== null) {
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
    this.terminal = state.terminal

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
        this.focusComposer()
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
