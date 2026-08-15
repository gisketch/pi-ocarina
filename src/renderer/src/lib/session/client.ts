import {
  PROTOCOL_VERSION,
  normalizeEvent,
  type CommandName,
  type CommandParams,
  type CommandResult,
  type EventBatch,
  type UiEvent,
} from '../../../../shared/protocol'

export type ThreadListener = (events: UiEvent[]) => void

/** Sends a command to the backend. Injected so the client is testable without
 *  Electron, and null in the browser harness. */
export type CommandSender = <N extends CommandName>(
  name: N,
  params: CommandParams<N>,
) => Promise<CommandResult<N>>

/** Fans incoming batches out to whoever is watching each thread.
 *
 *  All routing is by thread id, so a listener only ever sees its own thread —
 *  a busy thread cannot leak events into a quiet one. */
export class SessionClient {
  #listeners = new Map<string, Set<ThreadListener>>()
  #nextSeq = new Map<string, number>()
  #send: CommandSender | null

  constructor(send: CommandSender | null = null) {
    this.#send = send
  }

  subscribe(threadId: string, listener: ThreadListener): () => void {
    const existing = this.#listeners.get(threadId)
    const set = existing ?? new Set<ThreadListener>()
    if (!existing) this.#listeners.set(threadId, set)
    set.add(listener)

    return () => {
      set.delete(listener)
      if (set.size === 0) this.#listeners.delete(threadId)
    }
  }

  /** Accepts a transport payload of unknown trustworthiness and delivers clean
   *  events. Batches from an incompatible protocol are dropped whole: guessing
   *  at a shape we do not understand is worse than showing nothing. */
  ingest(batches: readonly EventBatch[]): void {
    for (const batch of batches) {
      if (batch.v !== PROTOCOL_VERSION) continue

      const events = batch.events.map(normalizeEvent)
      const expected = this.#nextSeq.get(batch.threadId) ?? batch.from

      // A gap means the transport lost events. Say so in the thread rather than
      // rendering a history with a hole in it.
      if (batch.from > expected) {
        events.unshift({
          kind: 'raw',
          rawKind: 'dropped-events',
          detail: `${batch.from - expected} event(s) lost in transport`,
        })
      }

      this.#nextSeq.set(batch.threadId, batch.from + batch.events.length)
      this.#deliver(batch.threadId, events)
    }
  }

  invoke<N extends CommandName>(name: N, params: CommandParams<N>): Promise<CommandResult<N>> {
    if (!this.#send) {
      return Promise.reject(new Error(`no session backend: ${name} is unavailable`))
    }
    return this.#send(name, params)
  }

  forget(threadId: string): void {
    this.#nextSeq.delete(threadId)
  }

  #deliver(threadId: string, events: UiEvent[]): void {
    const listeners = this.#listeners.get(threadId)
    if (!listeners) return
    // Copied so a listener unsubscribing mid-delivery cannot skip its neighbour.
    for (const listener of [...listeners]) listener(events)
  }
}
