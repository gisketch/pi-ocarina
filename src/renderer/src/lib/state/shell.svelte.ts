import { app } from './app.svelte'
import { effectiveKey, EMPTY_KEYMAP, type Keymap } from '../keymap'
import { runAction } from './shell-actions'
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
import { threadOf, workspaceOfTerminal } from '../types'
import { terminals } from './terminal.svelte'
import { termMode } from './term-mode.svelte'
import { following } from './following.svelte'
import { reasoningOpen } from './reasoning.svelte'
import { agentPeek } from './agent-peek.svelte'
import { blockMenu, copyText } from './block-menu.svelte'
import { blockNav } from './block-nav.svelte'
import { changes } from './changes.svelte'
import { permission } from './permission.svelte'
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
  /** The reader's bindings, translated once when the file is read. Empty until
   *  then, and empty forever for a reader who never wrote one — which is the
   *  case where this must cost nothing. */
  keymap = $state.raw<Keymap>(EMPTY_KEYMAP)

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

  closeThread(columnId: string, { cancelTurn }: { cancelTurn: boolean }): void {
    const workspaceId = workspaceOfTerminal(columnId)
    if (workspaceId) {
      terminals.kill(workspaceId)
      blockNav.forget(columnId)
      agentPeek.forget(columnId)
      catalog.closeColumn(columnId)
      return
    }

    const column = app.workspace.threads.find((thread) => thread.id === columnId)
    const threadId = column ? threadOf(column) : null

    blockNav.forget(columnId)
    askKeys.forget(columnId)
    // A column with no session behind it has no turn to cancel and no session
    // file to hide. `requestClose` turns the placeholder away already; this is
    // the type saying the same thing where the id would otherwise be spent.
    if (threadId === null) return

    if (cancelTurn) threads.cancel(threadId)
    // The column goes now. The checkout behind it is settled afterwards,
    // because the answer can need a question and a person watching a column
    // that will not close has no idea what it is waiting for.
    const isolated = column?.branch
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
    const remapped = effectiveKey(this.keymap, before.mode, event.key)
    const { state, actions, preventDefault, timer } = reduceKey(
      before,
      remapped === event.key
        ? event
        : {
            key: remapped,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
          },
      {
        workspaceCount: app.workspaces.length,
        terminalColumn: app.thread.terminal === true,
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

export const shell = new ShellState()
