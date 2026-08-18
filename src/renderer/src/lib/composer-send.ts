/** What pressing ⏎ in the composer actually does with the message.
 *
 *  Lifted out of the component because it is the one step with real
 *  consequences — it starts a turn, or queues into one — and because reading it
 *  next to caret tracking and menu filtering made it hard to see. The component
 *  keeps the field; this keeps the sequence.
 */

import type { AttachmentRef, ThreadRunState } from '../../../shared/vocabulary'
import type { ThreadId } from '../../../shared/thread-id'
import { planSend } from './composer'

export interface SendDeps {
  runState: ThreadRunState
  /** A fresh column has no thread behind it yet; sending is what creates one.
   *  Null when it could not be created, and nothing is sent. */
  targetThread: () => Promise<ThreadId | null>
  /** Every fold's real text back where its token stood. */
  expand: (text: string) => string
  attachments: () => AttachmentRef[]
  prompt: (threadId: ThreadId, text: string, attachments: AttachmentRef[]) => void
  steer: (threadId: ThreadId, text: string) => void
  /** Called once the message has gone somewhere, never before: losing a prompt
   *  to a failed send would mean retyping it.
   *
   *  Given the thread it actually went to, which is not always the one the
   *  composer was drawn over: sending from a fresh column creates the thread,
   *  and the placeholder's id dies with it. */
  sent: (threadId: ThreadId) => void
}

/** Sends or queues. Returns whether the composer should clear. */
export async function sendMessage(text: string, deps: SendDeps): Promise<boolean> {
  const plan = planSend(text, deps.runState)
  if (plan.action === 'none') return false

  const threadId = await deps.targetThread()
  if (!threadId) return false

  const said = deps.expand(plan.text)
  if (plan.action === 'prompt') deps.prompt(threadId, said, deps.attachments())
  else deps.steer(threadId, said)

  deps.sent(threadId)
  return true
}
