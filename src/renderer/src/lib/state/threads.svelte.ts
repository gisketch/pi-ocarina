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
    })

    void session.invoke('openThread', { threadId }).catch((cause: unknown) => {
      box.error = cause instanceof Error ? cause.message : String(cause)
    })
  }

  /** Seeds a thread from a recorded stream instead of the backend — the mock
   *  catalog's path, and how component tests build a column. */
  seed(threadId: string, model: ThreadViewModel): void {
    const box = this.#box(threadId)
    box.following = true
    box.model = model
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
