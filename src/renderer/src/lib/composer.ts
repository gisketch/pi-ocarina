import type { ThreadRunState } from '../../../shared/vocabulary'

/** What pressing ⏎ in the composer should do. */
export type SendPlan =
  | { action: 'none' }
  | { action: 'prompt'; text: string }
  | { action: 'steer'; text: string }

/** Decides between starting a turn and queueing into the one already running.
 *
 *  The branch is on `runState` — what the agent is actually doing — not on the
 *  displayed status. A thread showing `waiting-input` because a card is open
 *  may still have a turn in flight, and typing into that must queue rather than
 *  start a second turn on top of it.
 *
 *  The composer is never disabled, so there is always something sensible to do
 *  with what the user typed. */
export function planSend(text: string, runState: ThreadRunState): SendPlan {
  const trimmed = text.trim()
  if (trimmed === '') return { action: 'none' }

  return runState === 'running' ? { action: 'steer', text: trimmed } : { action: 'prompt', text: trimmed }
}

/** Whether this keystroke sends. `shift+⏎` is a newline, never a send — the
 *  one modifier a person reaches for when they mean "keep typing". */
export function isSendKey(event: { key: string; shiftKey?: boolean }): boolean {
  return event.key === 'Enter' && !event.shiftKey
}

/** The hint shown beside ⏎, so the composer says which of the two it will do
 *  before the user commits to it. */
export function sendHint(runState: ThreadRunState): string {
  return runState === 'running' ? 'queue' : 'send'
}
