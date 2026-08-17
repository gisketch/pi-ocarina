/** What one live session's events do.
 *
 *  Split out of the driver, which is otherwise about commands: this is the only
 *  place events flow the other way, and it is the one place that has to be
 *  careful about *when* it acts rather than only what it does. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
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
}: Wiring): () => void {
  translator.watchChanges((toolCallId) => changes.end(threadId, toolCallId))

  /** Paths of reads in flight. pi's end event carries no arguments, so the one
   *  thing the picture needs — which file — has to be kept from the start. */
  const reading = new Map<string, unknown>()

  return session.subscribe((event) => {
    // Before the translation, and synchronously. pi is about to write the file,
    // and an awaited read would come back holding the version it had already
    // changed — the "before" would be the "after", and every diff would be
    // empty.
    if (event.type === 'tool_execution_start' && CHANGING_TOOLS.has(event.toolName)) {
      changes.start(event.toolCallId, toolTarget(event.toolName, event.args), cwd)
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
        void imageBody(event.toolName, args, cwd, event.isError === true).then((body) => {
          if (body) emit(threadId, { kind: 'tool-body', id, body })
        })
      }
    }

    if (event.type === 'turn_end') emitUsage(emit, threadId, session, spent())
    if (event.type === 'queue_update') steers.sync(threadId, event.steering)
  })
}
