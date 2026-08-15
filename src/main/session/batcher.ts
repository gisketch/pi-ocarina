import { PROTOCOL_VERSION, type EventBatch, type UiEvent } from '../../shared/protocol'

/** Roughly one frame at 60Hz. Streaming can produce dozens of events per frame;
 *  the renderer should still do one DOM pass, so coalescing happens here rather
 *  than in the reducer. */
export const BATCH_INTERVAL_MS = 16

export type FlushBatches = (batches: EventBatch[]) => void
export type ScheduleFlush = (run: () => void) => void

const defaultSchedule: ScheduleFlush = (run) => {
  setTimeout(run, BATCH_INTERVAL_MS)
}

/** Collects events per thread and hands them over in whole batches.
 *
 *  Order is preserved within a thread and threads never share a batch, so one
 *  thread's flood can never reorder or contaminate another's stream. */
export class EventBatcher {
  #pending = new Map<string, UiEvent[]>()
  #nextSeq = new Map<string, number>()
  #scheduled = false

  readonly #flush: FlushBatches
  readonly #schedule: ScheduleFlush

  constructor(flush: FlushBatches, schedule: ScheduleFlush = defaultSchedule) {
    this.#flush = flush
    this.#schedule = schedule
  }

  push(threadId: string, event: UiEvent): void {
    const queue = this.#pending.get(threadId)
    if (queue) queue.push(event)
    else this.#pending.set(threadId, [event])

    if (this.#scheduled) return
    this.#scheduled = true
    this.#schedule(() => this.flushNow())
  }

  /** Sends whatever has accumulated. Silent when there is nothing to say. */
  flushNow(): void {
    this.#scheduled = false
    if (this.#pending.size === 0) return

    const batches: EventBatch[] = []
    for (const [threadId, events] of this.#pending) {
      const from = this.#nextSeq.get(threadId) ?? 0
      this.#nextSeq.set(threadId, from + events.length)
      batches.push({ v: PROTOCOL_VERSION, threadId, from, events })
    }

    this.#pending.clear()
    this.#flush(batches)
  }

  /** Drops a finished thread's sequence bookkeeping. */
  forget(threadId: string): void {
    this.#pending.delete(threadId)
    this.#nextSeq.delete(threadId)
  }

  get pendingThreads(): number {
    return this.#pending.size
  }
}
