import type { CommandName, CommandParams } from '../../../../shared/protocol'
import type { ApprovalOutcome } from '../../../../shared/vocabulary'
import { session } from '../session'
import { reduceBatch } from '../thread-reducer'
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
      box.model = reduceBatch(box.model, events)
      box.loaded = true
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

  /** What the cards in a thread do.
   *
   *  Each is fire-and-forget on purpose: the command is a request, and the
   *  thread's own events are what change the view. A card that painted itself
   *  resolved on a resolved promise would be showing an outcome the backend
   *  had not confirmed. Failures land on the thread rather than in a console
   *  nobody is reading. */
  answer(threadId: string, askId: string, optionIndex: number): void {
    this.#command(threadId, 'answerAsk', { threadId, askId, optionIndex })
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
