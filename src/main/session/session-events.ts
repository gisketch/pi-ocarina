/** What one live session's events do.
 *
 *  Split out of the driver, which is otherwise about commands: this is the only
 *  place events flow the other way, and it is the one place that has to be
 *  careful about *when* it acts rather than only what it does. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { HookPoint } from '../../shared/config-file'
import type { EmitEvent } from '../../shared/protocol'
import { CHANGING_TOOLS, type ChangeLog } from './change-log'
import { PiTranslator, toolTarget } from './pi-translate'
import { emitUsage } from './session-report'
import { imageBody } from './tool-image'
import type { SteerQueue } from './steering'

export interface Wiring {
  session: AgentSession
  threadId: string
  /** The workspace root, for turning a tool's relative path into a real one. */
  cwd: string
  translator: PiTranslator
  emit: EmitEvent
  changes: ChangeLog
  steers: SteerQueue
  /** What this thread's children have spent. pi cannot see them, so the figure
   *  has to be added in from outside its accounting. */
  spent: () => { tokens: number; costUsd: number }
  /** Whether a path outside the workspace is one this app staged. Without it
   *  a pasted screenshot the agent read draws nothing: it lives in a temporary
   *  directory, which is exactly what the containment check refuses. */
  staged?: (path: string) => boolean
  /** Runs the reader's hooks for a point. Absent means no hooks, which is what
   *  most readers have and what every test without one gets. */
  hooks?: (point: HookPoint, threadId: string) => Promise<unknown>
}

/** Subscribes one session, and returns the unsubscribe. */
export function subscribeSession({
  session,
  threadId,
  cwd,
  translator,
  emit,
  changes,
  steers,
  spent,
  staged,
  hooks,
}: Wiring): () => void {
  translator.watchChanges((toolCallId) => changes.end(threadId, toolCallId))

  /** Paths of reads in flight. pi's end event carries no arguments, so the one
   *  thing the picture needs — which file — has to be kept from the start. */
  const reading = new Map<string, unknown>()

  /** Whether this turn changed a file. What decides if `edit.after` runs: a
   *  formatter has nothing to format on a turn that only read. */
  let edited = false

  return session.subscribe((event) => {
    // Before the translation, and synchronously. pi is about to write the file,
    // and an awaited read would come back holding the version it had already
    // changed — the "before" would be the "after", and every diff would be
    // empty.
    if (event.type === 'tool_execution_start' && CHANGING_TOOLS.has(event.toolName)) {
      changes.start(event.toolCallId, toolTarget(event.toolName, event.args), cwd)
      edited = true
    }
    if (event.type === 'tool_execution_start' && event.toolName === 'read') {
      reading.set(event.toolCallId, event.args)
    }

    for (const translated of translator.translate(event)) emit(threadId, translated)

    // A picture the agent read, drawn as one. Deliberately after the row has
    // settled and deliberately not awaited: reading the file is disk work, and
    // a body attaches by id whenever it arrives, so the row never waits on it.
    if (event.type === 'tool_execution_end') {
      const id = event.toolCallId
      // Consumed on read: a call ends once, and a map that only grew would
      // hold every path of a long thread for nothing.
      const args = reading.get(id)
      reading.delete(id)
      if (args !== undefined) {
        void imageBody(event.toolName, args, cwd, event.isError === true, staged).then((body) => {
          if (body) emit(threadId, { kind: 'tool-body', id, body })
        })
      }
    }

    // Before anything the turn does. A hook here is for taking a note or a
    // snapshot; it cannot change what the turn is about to do.
    if (event.type === 'turn_start') {
      edited = false
      void hooks?.('turn.start', threadId)
    }

    if (event.type === 'turn_end') {
      // A read abandoned by an abort never sends its end event, so its entry
      // would sit in the map for the life of the thread. Nothing is pending
      // once the turn is over.
      reading.clear()
      emitUsage(emit, threadId, session, spent())

      // After the turn, never during it. A hook observes; it cannot hold the
      // turn open or change what the agent did. Not awaited here — the
      // subscription is synchronous, and a hook's rows attach to the thread
      // whenever they arrive.
      //
      // `edit.after` only when the turn actually changed a file. A formatter
      // has nothing to format on a turn that only read, and a row saying it
      // ran would be a row about nothing.
      const after = edited ? hooks?.('edit.after', threadId) : undefined
      void Promise.resolve(after).then(() => hooks?.('turn.end', threadId))
    }
    if (event.type === 'queue_update') steers.sync(threadId, event.steering)
  })
}
