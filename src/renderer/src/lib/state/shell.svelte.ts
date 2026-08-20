import { app } from './app.svelte'
import { decodePress, effectiveKey, EMPTY_KEYMAP, encodePress, type Keymap } from '../keymap'
import { runAction } from './shell-actions'
import { catalog } from './catalog.svelte'
import { dashboardRecent } from './dashboard-recent.svelte'
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { askKeys } from './ask-keys.svelte'
import { routeToOverlay, routeToSurface, termSwallows } from './key-routing.svelte'
import { sweep } from './sweep.svelte'
import { settleWorktree } from './worktree-close'
import { threadGit } from './thread-git.svelte'
import { threadOf, workspaceOfTerminal } from '../types'
import { terminals } from './terminal.svelte'
import { termMode } from './term-mode.svelte'
import { following } from './following.svelte'
import { reasoningOpen } from './reasoning.svelte'
import { agentPeek } from './agent-peek.svelte'
import { blockMenu, copyText } from './block-menu.svelte'
import { buffers } from './buffers.svelte'
import { blockNav } from './block-nav.svelte'
import { changes } from './changes.svelte'
import { permission } from './permission.svelte'
import { preferences } from './preferences.svelte'
import { threads } from './threads.svelte'
import { newestCodeBlock } from '../thread'
import { attachmentFor, movePane } from '../pane-layout'
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
  /** The reader's bindings, translated once when the file is read. Empty until
   *  then, and empty forever for a reader who never wrote one — which is the
   *  case where this must cost nothing. */
  keymap = $state.raw<Keymap>(EMPTY_KEYMAP)

  /** The thread waiting on a "close this running turn?" answer, if any. */
  pendingClose = $state<string | null>(null)
  pendingCloseTerminalId = $state<string | null>(null)
  pendingCloseTerminalBusy = $state(false)

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

  /** Whether the model picker is choosing for this thread or for new threads.
   *
   *  A flag rather than a second overlay: the two screens would be identical,
   *  and an overlay that exists twice is two places for the list to drift. */
  modelFor = $state<'thread' | 'default'>('thread')

  openModelFor(target: 'thread' | 'default'): void {
    this.modelFor = target
    this.openOverlay('model')
  }

  newThread(): void {
    if (catalog.source !== 'live') {
      void catalog.pin()
      return
    }

    // A dashboard, not a thread. Nothing reaches the backend until the reader
    // chooses on the column itself — so an abandoned `␣n` leaves no orphan
    // session behind, which the old immediate creation always did.
    const column = catalog.addDashboard(app.workspace.id)
    if (column === -1) return
    // The list itself loads from the dashboard component's own effect; this
    // only puts the bar back on top for the launcher that is about to show.
    dashboardRecent.resetBar(app.workspace.id)
    app.focusThread(column)
    app.mode = 'OCARINA'
  }

  /** Closes the focused thread, asking first if a turn is running.
   *
   *  Closing cancels the turn, and a turn is work the person is waiting on, so
   *  a single keystroke must not throw it away. An idle thread has nothing to
   *  lose, so it closes at once. */
  requestClose(): void {
    const thread = app.thread
    if (thread.id === '') return
    // The dashboard is not a thread — closing it is only taking the column
    // away, and it made nothing that needs telling. A lone dashboard comes
    // straight back (the workspace must keep one column), which reads as the
    // no-op it is.
    if (thread.fresh) {
      blockNav.forget(thread.id)
      catalog.closeColumn(thread.id)
      return
    }

    const attachment = thread.terminal ? undefined : attachmentFor(app.workspace, thread.id)
    // Unsaved text outranks the group question: confirming a terminal close
    // must never kill the shell and then discover the buffer refused to leave.
    if (thread.file !== undefined && buffers.get(thread.id)?.dirty) {
      buffers.quit(thread.id, false)
      return
    }
    if (attachment) {
      void terminals.busy(attachment.id).then((busy) => {
        this.pendingCloseTerminalId = attachment.id
        this.pendingCloseTerminalBusy = busy
        this.pendingClose = thread.id
      })
      return
    }

    // A buffer answers `␣x` the way it answers `:q`: unsaved work refuses
    // and says why on its own notice line; a clean buffer just goes.
    if (thread.file !== undefined) {
      buffers.quit(thread.id, false)
      return
    }

    if (thread.terminal) {
      // Closing kills the shell, so a command still running is worth one
      // question — the same bargain a running turn gets.
      void terminals.busy(thread.id).then((busy) => {
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

  closeThread(columnId: string, { cancelTurn }: { cancelTurn: boolean }): void {
    const workspaceId = workspaceOfTerminal(columnId)
    if (workspaceId) {
      terminals.kill(columnId)
      blockNav.forget(columnId)
      agentPeek.forget(columnId)
      catalog.closeColumn(columnId)
      return
    }

    const column = app.workspace.threads.find((thread) => thread.id === columnId)
    const attachment = column ? attachmentFor(app.workspace, column.id) : undefined
    const threadId = column ? threadOf(column) : null

    blockNav.forget(columnId)
    askKeys.forget(columnId)
    // A column with no session behind it has no turn to cancel and no session
    // file to hide. `requestClose` turns the placeholder away already; this is
    // the type saying the same thing where the id would otherwise be spent.
    if (column?.file !== undefined) {
      buffers.quit(column.id, false)
      if (app.workspace.threads.some((thread) => thread.id === column.id)) return
      if (attachment) this.closeThread(attachment.id, { cancelTurn: false })
      return
    }
    if (column?.fresh) {
      catalog.closeColumn(column.id)
      if (attachment) this.closeThread(attachment.id, { cancelTurn: false })
      return
    }
    if (threadId === null) return

    if (cancelTurn) threads.cancel(threadId)
    // The column goes now. The checkout behind it is settled afterwards,
    // because the answer can need a question and a person watching a column
    // that will not close has no idea what it is waiting for.
    const isolated = column?.branch
    catalog.closeThread(threadId)
    if (attachment) this.closeThread(attachment.id, { cancelTurn: false })
    threadGit.forget(threadId)
    if (isolated) void settleWorktree(threadId)
  }

  /** Moves the focused column itself, rather than the focus. */
  moveColumn(delta: number): void {
    const focusedId = app.thread.id
    const moved = movePane(app.workspace, focusedId, delta < 0 ? -1 : 1)
    if (moved === app.workspace) return
    catalog.workspaces = catalog.workspaces.map((workspace) =>
      workspace.id === moved.id ? moved : workspace,
    )
    const index = moved.threads.findIndex((thread) => thread.id === focusedId)
    if (index !== -1) app.focusThread(index)
  }

  /** Returns true when the event was consumed and should be prevented. */
  handleKey(event: KeyEventLike): boolean {
    // A key a surface already answered is not the shell's to read again. The
    // hole this closes: a picker's input handles a key in the target phase,
    // the pick closes the overlay, and the same event then bubbles to the
    // window — where the shell, seeing no overlay any more, read the digit
    // that chose a voice as "go to that workspace".
    if (event.defaultPrevented) return false

    // TERM's keys are the pty's, so nothing below may run for them — the why
    // and the modal exceptions live with the predicate.
    if (termSwallows(event, app.mode, this.pendingClose, this.overlay)) return false

    // Everything modal answers first, in one place that owns the ranking.
    const answered = routeToOverlay(event, this.keymap)
    if (answered !== null) return answered

    // Everything `routeToSurface` asks belongs to a column: a block menu, the
    // leap hints, a pending question, the agent peek. All four sit behind an
    // open overlay, so none of them may read a key from under one — a digit
    // answering a question the reader cannot see is the worst version of it.
    if (this.overlay === null && routeToSurface(event, app.mode, app.threadId)) return true

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
      this.pendingCloseTerminalId = null
      this.pendingCloseTerminalBusy = false
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

    // The reader's own bindings are applied here, before the reducer sees the
    // key. Binding `x` to what `l` already does means the reducer is handed
    // `l`, so the two can never disagree about what `l` means.
    // Rebuilt field by field, never spread. `event` is a live `KeyboardEvent`,
    // whose `metaKey`/`ctrlKey`/`altKey` are prototype accessors — a spread
    // copies none of them, so a remapped `⌥j` would arrive at the reducer
    // looking like a bare `j` and walk straight past the guard that ignores
    // modifier chords.
    const press = encodePress(event)
    const remapped = effectiveKey(this.keymap, before.mode, press)
    const { state, actions, preventDefault, timer } = reduceKey(
      before,
      remapped === press
        ? event
        : // A translated press names its own chord: `C-d` decodes with control
          // held, a bare key without it. The original event's modifiers do not
          // ride along — `z` bound to the half-page scroll must arrive looking
          // exactly like `^d`.
          { ...decodePress(remapped), metaKey: false, altKey: false },
      {
        workspaceCount: app.workspaces.length,
        terminalColumn: app.thread.terminal === true,
        dashboardColumn: app.thread.fresh === true,
        bufferColumn: app.thread.file !== undefined,
      },
    )

    app.mode = state.mode
    this.overlay = state.overlay

    if (timer === 'clear') this.clearLeaderTimer()
    if (timer === 'start') this.startLeaderTimer()

    for (const action of actions) runAction(this, action)
    blockNav.reconcileMode()

    // Tab moves the browser's focus, and this app moves its own. Nothing above
    // claimed this one — the composer's completion, the role form and the diff
    // viewer all answer Tab before it reaches here — so it is a keystroke that
    // would walk a ring through buttons the reader navigates with `j` and `k`
    // instead. Swallowed rather than styled away: an element the ring is
    // hidden on is still somewhere the reader can end up and not see.
    //
    // The terminal never reaches this line. It answers in `routeToSurface`,
    // where a Tab belongs to the shell running inside it.
    if (event.key === 'Tab') return true

    return preventDefault
  }

  private startLeaderTimer(): void {
    this.clearLeaderTimer()
    this.leaderTimer = setTimeout(() => {
      if (app.mode === 'LEADER') app.mode = 'OCARINA'
      this.leaderTimer = null
    }, preferences.leaderTimeoutMs)
  }

  private clearLeaderTimer(): void {
    if (this.leaderTimer === null) return
    clearTimeout(this.leaderTimer)
    this.leaderTimer = null
  }
}

export const shell = new ShellState()
