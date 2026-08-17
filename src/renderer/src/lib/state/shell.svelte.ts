import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { askKeys } from './ask-keys.svelte'
import { createThread } from './new-thread'
import { routeToOverlay, routeToSurface } from './key-routing.svelte'
import { sweep } from './sweep.svelte'
import { settleWorktree } from './worktree-close'
import { threadGit } from './thread-git.svelte'
import { worktreeAsk } from './worktree-ask.svelte'
import { workspaceOfTerminal } from '../types'
import { terminals } from './terminal.svelte'
import { termMode } from './term-mode.svelte'
import { agentPeek } from './agent-peek.svelte'
import { blockMenu, copyText } from './block-menu.svelte'
import { blockNav } from './block-nav.svelte'
import { changes } from './changes.svelte'
import { preferences } from './preferences.svelte'
import { threads } from './threads.svelte'
import { newestCodeBlock } from '../thread'
import {
  type Action,
  type KeyEventLike,
  type KeyState,
  LEADER_TIMEOUT_MS,
  MODIFIER_KEYS,
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
    // The question comes before the column, and only in a repository. Its
    // default answer is the thread this app has always made.
    void createThread(workspaceId).then((threadId) => {
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
    const workspaceId = workspaceOfTerminal(threadId)
    if (workspaceId) {
      terminals.kill(workspaceId)
      blockNav.forget(threadId)
      catalog.closeColumn(threadId)
      return
    }

    if (cancelTurn) threads.cancel(threadId)
    blockNav.forget(threadId)
    askKeys.forget(threadId)
    // The column goes now. The checkout behind it is settled afterwards,
    // because the answer can need a question and a person watching a column
    // that will not close has no idea what it is waiting for.
    const isolated = app.workspace.threads.find((thread) => thread.id === threadId)?.branch
    catalog.closeThread(threadId)
    threadGit.forget(threadId)
    if (isolated) void settleWorktree(threadId)
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
    // Everything modal answers first, in one place that owns the ranking.
    const answered = routeToOverlay(event)
    if (answered !== null) return answered

    if (routeToSurface(event, app.mode, app.thread.id)) return true

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
    // `esc` backs out of one thing at a time. An open overlay is nearer, so it
    // goes first and the ring survives to be released by the next press.
    //
    // Gated on the ring rather than on READ: a reader can leave READ by doors
    // that do not pass through here — a leader chord, a digit — and a ring
    // that only `esc`-from-READ could clear would strand a dimmed transcript
    // with no way back.
    if (event.key === 'Escape' && before.overlay === null) blockNav.release()

    const { state, actions, preventDefault, timer } = reduceKey(before, event, {
      workspaceCount: app.workspaces.length,
      terminalColumn: app.thread.terminal === true,
    })

    app.mode = state.mode
    this.overlay = state.overlay

    if (timer === 'clear') this.clearLeaderTimer()
    if (timer === 'start') this.startLeaderTimer()

    for (const action of actions) this.run(action)
    blockNav.reconcileMode()

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
      case 'moveBlock':
        blockNav.moveBlock(action.delta)
        break
      case 'page':
        blockNav.page(action.delta)
        break
      case 'scroll':
        blockNav.scroll(action.delta)
        break
      case 'leap':
        blockNav.leap()
        break
      case 'openChanges':
        // A shell has no files to change, and a thread nobody has prompted has
        // not changed any. Both would open a modal viewer over nothing, and a
        // modal owns every key — so the mode goes straight back instead.
        if (app.thread.terminal || app.thread.fresh) app.mode = 'NORMAL'
        else void changes.show(app.thread.id)
        break
      case 'openBlockMenu':
        blockNav.openBlockMenu()
        break
      case 'expandBlock':
        blockNav.expandBlock(action.open)
        break
      case 'focusComposer':
        // `i` means "start typing at the focused column". For a shell that is
        // TERM, not the composer — which is not even on screen.
        if (app.thread.terminal) termMode.enter()
        else {
          // A half-dimmed transcript behind a live caret reads as broken. The
          // reader has stopped navigating; give the column its plain look back.
          blockNav.release()
          this.focusComposer()
        }
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
        termMode.open()
        break
      case 'termEscape':
        termMode.escape()
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

  await copyText(code)
}

export const shell = new ShellState()
