import type { SessionEntry } from '@earendil-works/pi-coding-agent'
import type { UiEvent } from '../../shared/protocol'
import { joinTextParts, toolBody, toolKind, toolTarget } from './pi-translate'
import { answerFromResult, askFromCall, ASK_TOOL, endedUnanswered } from './ask-replay'

// Colour codes reach the transcript when something formats for a terminal.
// They are noise in a GUI, and they would make replay differ from live text.
const ANSI = /\u001b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

/** Session-file bookkeeping the live stream never shows either. */
const IGNORED_ENTRIES: ReadonlySet<string> = new Set([
  'session',
  'model_change',
  'thinking_level_change',
  'session_info',
  'file',
])

/** Rebuilds a thread from its session file as the same events live streaming
 *  would have produced.
 *
 *  One vocabulary, one reducer, two sources — so reopening a thread cannot
 *  drift from having watched it happen. Deltas arrive whole here rather than
 *  character by character; the reducer concatenates either way. */
export function replayEntries(entries: readonly SessionEntry[]): UiEvent[] {
  const events: UiEvent[] = []
  let messages = 0
  let sawAssistant = false
  let lastRole: string | undefined
  // Calls that started and never reported back. A turn interrupted mid-tool
  // writes the call to the transcript and never writes its result.
  const openCalls = new Set<string>()
  /** Calls that were questions, so their result rebuilds a card. */
  const asked = new Set<string>()

  for (const entry of entries) {
    if (entry.type !== 'message') {
      if (!IGNORED_ENTRIES.has(entry.type)) {
        events.push({ kind: 'raw', rawKind: entry.type })
      }
      continue
    }

    const message = entry.message as {
      role?: string
      content?: unknown
      toolCallId?: string
      toolName?: string
      isError?: boolean
    }
    const parts = Array.isArray(message.content) ? message.content : []

    if (typeof message.role === 'string') lastRole = message.role

    if (message.role === 'user') {
      const text = stripAnsi(joinTextParts(parts))
      if (!text) continue

      // Every user message is a point the conversation can be rewound to: it is
      // where a branch of the session tree begins, and pi can navigate back to
      // that entry. The checkpoint keeps the session entry's own id, because
      // that is what `restoreCheckpoint` hands back to pi.
      //
      // The message gets a distinct id. One entry produces two blocks, and two
      // blocks that call themselves the same thing are not two blocks — the
      // list rendering them keys on the id and cannot tell them apart.
      events.push({ kind: 'checkpoint', id: entry.id, label: text.slice(0, 60) })
      events.push({ kind: 'user-message', id: `user:${entry.id}`, text })
      continue
    }

    if (message.role === 'toolResult') {
      const id = message.toolCallId
      if (!id) continue
      openCalls.delete(id)

      // A question the reader was part of is rebuilt as the card it was, not
      // as a tool row saying `ask_user ✓`. A call whose questions could not be
      // read never became a card, so it stays a row: the alternative is an
      // answer event for a block that does not exist, which the reducer drops,
      // leaving a silent gap where the agent tried to ask something.
      if (asked.has(id)) {
        events.push(answerFromResult(id, message))
        continue
      }

      const body = toolBody(message.toolName ?? '', message)
      if (body) events.push({ kind: 'tool-body', id, body })
      events.push({ kind: 'tool-end', id, status: message.isError ? 'fail' : 'ok' })
      continue
    }

    if (message.role !== 'assistant') continue
    sawAssistant = true

    for (const part of parts) {
      const content = part as { type?: string; text?: string; id?: string; name?: string; arguments?: unknown }

      if (content.type === 'text' && content.text) {
        messages += 1
        // Namespaced away from the live translator's ids. pi gives text parts no
        // id of their own, so both sides can only count — and two counters that
        // both start at one produce the same name for different messages the
        // moment a live turn runs on a thread that was read back from disk.
        const id = `replay-msg-${messages}`
        events.push({ kind: 'agent-message-start', id })
        events.push({ kind: 'agent-message-delta', id, text: stripAnsi(content.text) })
        events.push({ kind: 'agent-message-end', id })
      }

      if (content.type === 'toolCall' && content.id && content.name === ASK_TOOL) {
        const ask = askFromCall(content.id, content.arguments)
        if (ask) {
          asked.add(content.id)
          openCalls.add(content.id)
          events.push(ask)
          continue
        }
      }

      if (content.type === 'toolCall' && content.id) {
        openCalls.add(content.id)
        events.push({
          kind: 'tool-start',
          id: content.id,
          tool: toolKind(content.name ?? ''),
          target: toolTarget(content.name ?? '', content.arguments),
        })
      }

      // Thinking is dropped, exactly as it is live.
    }
  }

  // A call with no result is a call that was still running when the turn ended
  // — interrupted, or the app was closed. Left open it pulses forever, claiming
  // to be working on something nothing is working on.
  for (const id of openCalls) {
    // A question nobody answered because the app went away. It is a record
    // now, and not answerable: the call it belonged to is gone.
    events.push(asked.has(id) ? endedUnanswered(id) : { kind: 'tool-end', id, status: 'cancelled' })
  }

  // A transcript that stops on the user's own words is a turn that never
  // finished — the app was closed or killed mid-flight. Saying "done" there
  // would hide that the agent never answered; the user gets to decide whether
  // to continue it.
  const state = lastRole === 'user' ? 'interrupted' : sawAssistant ? 'done' : 'idle'
  events.push({ kind: 'thread-state', state })
  return events
}

/** States a thread from its history, replacing whatever is on screen.
 *
 *  The reset is not optional. Replay describes the thread from its beginning,
 *  so a thread that already holds its history — one closed and opened again, or
 *  one just rewound — would otherwise be shown a second copy of itself. */
export function emitReplay(
  emit: (event: UiEvent) => void,
  entries: readonly SessionEntry[],
): void {
  emit({ kind: 'thread-reset' })
  for (const event of replayEntries(entries)) emit(event)
}
