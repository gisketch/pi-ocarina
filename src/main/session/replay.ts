import type { SessionEntry } from '@earendil-works/pi-coding-agent'
import type { UiEvent } from '../../shared/protocol'
import { joinTextParts, toolBody, toolKind, toolTarget } from './pi-translate'

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

    if (message.role === 'user') {
      const text = stripAnsi(joinTextParts(parts))
      if (!text) continue

      // Every user message is a point the conversation can be rewound to: it is
      // where a branch of the session tree begins, and pi can navigate back to
      // that entry. The id is the session entry's, so it stays valid on disk.
      events.push({ kind: 'checkpoint', id: entry.id, label: text.slice(0, 60) })
      events.push({ kind: 'user-message', id: entry.id, text })
      continue
    }

    if (message.role === 'toolResult') {
      const id = message.toolCallId
      if (!id) continue
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
        const id = `msg-${messages}`
        events.push({ kind: 'agent-message-start', id })
        events.push({ kind: 'agent-message-delta', id, text: stripAnsi(content.text) })
        events.push({ kind: 'agent-message-end', id })
      }

      if (content.type === 'toolCall' && content.id) {
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

  // A reopened thread is finished, not running — say so, the way the last live
  // turn would have.
  events.push({ kind: 'thread-state', state: sawAssistant ? 'done' : 'idle' })
  return events
}
