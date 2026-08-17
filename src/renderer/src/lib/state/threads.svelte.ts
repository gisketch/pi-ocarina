import type {
  CommandName,
  CommandParams,
  ModelSummary,
  UiEvent,
} from '../../../../shared/protocol'
import type { AskAnswer, ApprovalOutcome, AttachmentRef, ReasoningLevel } from '../../../../shared/vocabulary'
import { noticesFor } from '../notices'
import { session } from '../session'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { connectivity } from './connectivity.svelte'
import { git } from './git.svelte'
import { threadGit } from './thread-git.svelte'
import { toasts } from './toasts.svelte'
import { reduceBatch } from '../thread-reducer'
import { changes } from './changes.svelte'
import { EMPTY_THREAD, type ThreadViewModel } from '../thread'

/** One thread's live view model.
 *
 *  `$state.raw` on purpose: the reducer already returns a fresh immutable model
 *  every time, so deep-proxying it would pay for change tracking the reducer
 *  has done already — and pay it per token during a stream. */
class ThreadBox {
  model = $state.raw<ThreadViewModel>(EMPTY_THREAD)
  following = false
  error = $state.raw<string | null>(null)
  /** False until the thread has said anything at all. Reading a long session
   *  file back takes time, and an empty column would claim the thread is empty
   *  when it is only still loading. */
  loaded = $state.raw(false)
}

/** Live threads, keyed by id.
 *
 *  A thread is followed for the life of the app, not the life of its column.
 *  Threads run in the background by design — switching workspace must not stop
 *  one, and coming back must not cost a replay. */
class ThreadStore {
  #boxes = new Map<string, ThreadBox>()

  /** The current model. Reading it in a component subscribes to that thread
   *  alone, so a burst in one column never re-renders another. */
  get(threadId: string): ThreadViewModel {
    return this.#box(threadId).model
  }

  errorFor(threadId: string): string | null {
    return this.#box(threadId).error
  }

  /** Starts following a thread. Safe to call on every render; only the first
   *  call subscribes and asks the backend to replay the thread's history. */
  follow(threadId: string): void {
    const box = this.#box(threadId)
    if (box.following) return
    box.following = true

    // One assignment per batch. Main coalesces a burst of events into a single
    // batch, so a 60-token burst reduces once and paints once.
    session.subscribe(threadId, (events) => {
      // Read before the reduce: whether the thread was mid-turn is what tells a
      // finished turn apart from a replayed history that ends on the same word.
      const wasRunning = box.model.runState === 'running'
      box.model = reduceBatch(box.model, events)
      box.loaded = true

      // A finished tool call may have written files without touching `.git`,
      // which no watcher can see. This is the only moment anything knows — and
      // it is the same moment the change viewer, if it is open on this thread,
      // stops being up to date.
      if (events.some((event) => event.kind === 'tool-end')) {
        git.refreshForThread(threadId)
        // An isolated thread's own checkout has no watcher — it is made and
        // removed with the thread — so this is the only moment its state can
        // be known to have moved.
        threadGit.refresh(threadId)
        void changes.refreshFor(threadId)
      }

      for (const event of events) {
        if (event.kind === 'connectivity') {
          connectivity.report(threadId, event.state, event.retryInSeconds)
        }
        // A retry cannot outlive the turn it belongs to. An interrupted turn
        // ends with no `auto_retry_end`, and the banner would otherwise say
        // the app was reconnecting for the rest of the session.
        if (event.kind === 'thread-state' && event.state !== 'running') {
          connectivity.report(threadId, 'restored')
        }
      }

      announce(threadId, events, wasRunning)
    })

    void session
      .invoke('openThread', { threadId })
      .then(() => {
        // A thread that opened and said nothing is genuinely empty — a new one.
        box.loaded = true
      })
      .catch((cause: unknown) => {
        box.error = cause instanceof Error ? cause.message : String(cause)
        box.loaded = true
      })
  }

  /** Whether this thread has finished reading its history back. */
  isLoaded(threadId: string): boolean {
    return this.#box(threadId).loaded
  }

  /** Seeds a thread from a recorded stream instead of the backend — the mock
   *  catalog's path, and how component tests build a column. */
  seed(threadId: string, model: ThreadViewModel): void {
    const box = this.#box(threadId)
    box.following = true
    box.loaded = true
    box.model = model
  }

  /** Everything below is fire-and-forget on purpose: the command is a request,
   *  and the thread's own events are what change the view. A card that painted
   *  itself resolved on a resolved promise would be showing an outcome the
   *  backend had not confirmed. Failures land on the thread rather than in a
   *  console nobody is reading. */

  /** Starts a turn. The user's own message comes back as an event, so the
   *  composer never draws it locally — one projection, one truth. */
  prompt(threadId: string, text: string, attachments: AttachmentRef[] = []): void {
    this.#command(threadId, 'prompt', {
      threadId,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
  }

  /** Queues text into the turn already running. */
  steer(threadId: string, text: string): void {
    this.#command(threadId, 'steer', { threadId, text })
  }

  /** Moves a thread onto another model, and optionally sets how hard it
   *  thinks. Both are pi's to persist — it writes them into the session — so
   *  nothing is kept here that could disagree after a relaunch. */
  setModel(threadId: string, model: ModelSummary, reasoning: ReasoningLevel | null): void {
    this.#command(threadId, 'setModel', {
      threadId,
      provider: model.provider,
      model: model.id,
    })
    if (reasoning) this.#command(threadId, 'setReasoning', { threadId, reasoning })
  }

  setReasoning(threadId: string, reasoning: ReasoningLevel): void {
    this.#command(threadId, 'setReasoning', { threadId, reasoning })
  }

  /** Every answer to one ask, sent once. */
  answer(threadId: string, askId: string, answers: AskAnswer[]): void {
    this.#command(threadId, 'answerAsk', { threadId, askId, answers })
  }

  resolveApproval(threadId: string, approvalId: string, outcome: ApprovalOutcome): void {
    this.#command(threadId, 'resolveApproval', { threadId, approvalId, outcome })
  }

  restore(threadId: string, checkpointId: string): void {
    this.#command(threadId, 'restoreCheckpoint', { threadId, checkpointId })
  }

  cancelSteer(threadId: string, steerId: string): void {
    this.#command(threadId, 'cancelQueuedSteer', { threadId, steerId })
  }

  compact(threadId: string): void {
    this.#command(threadId, 'compact', { threadId })
  }

  retry(threadId: string): void {
    this.#command(threadId, 'retryTurn', { threadId })
  }

  cancel(threadId: string): void {
    this.#command(threadId, 'cancelTurn', { threadId })
  }

  #command<N extends CommandName>(threadId: string, name: N, params: CommandParams<N>): void {
    const box = this.#box(threadId)
    box.error = null

    void session.invoke(name, params).catch((cause: unknown) => {
      box.error = cause instanceof Error ? cause.message : String(cause)
    })
  }

  #box(threadId: string): ThreadBox {
    const existing = this.#boxes.get(threadId)
    if (existing) return existing

    const box = new ThreadBox()
    this.#boxes.set(threadId, box)
    return box
  }
}

export const threads = new ThreadStore()

/** Raises a toast for anything that happened where the user could not see it.
 *
 *  The jump is carried as ids rather than a closure: the toast is data, and
 *  the one place that knows how to put a thread on screen makes the jump. */
function announce(threadId: string, events: readonly UiEvent[], wasRunning: boolean): void {
  const notices = noticesFor(events, { focused: app.thread.id === threadId, wasRunning })
  if (notices.length === 0) return

  const owner = catalog.workspaces.find((workspace) =>
    workspace.threads.some((thread) => thread.id === threadId),
  )
  const found = owner?.threads.find((thread) => thread.id === threadId)
  // A thread with no column has nowhere to jump to, so its toast offers no
  // action rather than an action that would do nothing.
  const jump = owner && found ? { workspaceId: owner.id, threadId, title: found.title } : undefined

  for (const notice of notices) {
    toasts.push(jump ? { ...notice, jump } : { ...notice, label: undefined })
  }
}
