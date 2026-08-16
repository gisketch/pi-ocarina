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
}: Wiring): () => void {
  translator.watchChanges((toolCallId) => changes.end(threadId, toolCallId))

  return session.subscribe((event) => {
    // Before the translation, and synchronously. pi is about to write the file,
    // and an awaited read would come back holding the version it had already
    // changed — the "before" would be the "after", and every diff would be
    // empty.
    if (event.type === 'tool_execution_start' && CHANGING_TOOLS.has(event.toolName)) {
      changes.start(event.toolCallId, toolTarget(event.toolName, event.args), cwd)
    }

    for (const translated of translator.translate(event)) emit(threadId, translated)
    if (event.type === 'turn_end') emitUsage(emit, threadId, session)
    if (event.type === 'queue_update') steers.sync(threadId, event.steering)
  })
}
