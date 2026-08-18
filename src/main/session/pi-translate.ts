import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { UiEvent } from '../../shared/protocol'
import type { ToolKind } from '../../shared/vocabulary'
import type { CallChange } from './change-log'
import { ASK_TOOL, askable } from './ask-replay'
import { toolDetail, toolKind, toolTarget } from './tool-rows'
import { FETCH_TOOL } from './fetch-tool'

export { toolDetail, toolKind, toolTarget } from './tool-rows'
export { fetchMeta, joinTextParts, lspMeta, resultText, toolBody } from './pi-results'
import { fetchMeta, joinTextParts, lspMeta, toolBody } from './pi-results'
import { diffOf } from './tool-diff'

/** Translates one pi session's events into the UI vocabulary.
 *
 *  Stateful only where pi is: pi streams text without naming the message, so
 *  the translator numbers them. Anything it cannot name becomes a `raw` event
 *  rather than disappearing. */
export class PiTranslator {
  #messageId: string | null = null
  #messages = 0
  /** When the current thought started, for the duration the block shows. Null
   *  when the model is not thinking. */
  #thinkingAt: number | null = null
  #compactions = 0
  #outcome: 'ok' | 'failed' | 'aborted' = 'ok'
  /** Calls that started and have not reported an end. pi sends nothing for a
   *  call abandoned by an abort, so without this the row would pulse as
   *  "running" for the rest of the thread's life. */
  #open = new Set<string>()
  /** Calls that became a card, so their end is the card's and not a row's. */
  #asked = new Set<string>()

  /** The model's context window, for turning token counts into percentages.
   *  Supplied by the driver, which can read the live session's stats. */
  readonly #contextWindow: () => number | undefined
  /** What a call did to its file, when the driver was watching the file. Only
   *  the driver can know this: pi reports which tool ran, never what the file
   *  looked like on either side of it. */
  #takeChange: (toolCallId: string) => CallChange | null = () => null

  /** Whether the approval gate stopped a call. pi reports every failure the
   *  same way (`isError`), so without this a command the user refused would
   *  read as one that broke — and the ledger would blame the tool. */
  readonly #wasBlocked: (toolCallId: string) => boolean

  constructor(
    contextWindow: () => number | undefined = () => undefined,
    wasBlocked: (toolCallId: string) => boolean = () => false,
  ) {
    this.#contextWindow = contextWindow
    this.#wasBlocked = wasBlocked
  }

  /** Told once, by the driver that owns the snapshots. */
  watchChanges(take: (toolCallId: string) => CallChange | null): void {
    this.#takeChange = take
  }

  /** Closes out every call still in flight, as cancelled.
   *
   *  Aborting a turn stops pi mid-call and it reports nothing further for the
   *  work it abandoned. The rows are the user's record of what happened, so
   *  they are settled here rather than left pulsing forever. Cancelled, not
   *  failed: the user chose this. */
  abandonOpenTools(): UiEvent[] {
    const events = [...this.#open].map(
      (id): UiEvent => ({ kind: 'tool-end', id, status: 'cancelled' }),
    )
    this.#open.clear()
    return events
  }

  translate(event: AgentSessionEvent): UiEvent[] {
    switch (event.type) {
      case 'agent_start':
        this.#outcome = 'ok'
        return [{ kind: 'thread-state', state: 'running' }]

      case 'agent_end': {
        if (event.willRetry) return [{ kind: 'thread-state', state: 'running' }]
        // A failed turn already reported itself; saying "done" on top of that
        // would tell the user the agent succeeded when it never ran.
        if (this.#outcome === 'failed') return []
        return [{ kind: 'thread-state', state: this.#outcome === 'aborted' ? 'idle' : 'done' }]
      }

      case 'message_start': {
        if (event.message.role !== 'assistant') return []
        this.#messages += 1
        this.#messageId = `msg-${this.#messages}`
        return [{ kind: 'agent-message-start', id: this.#messageId }]
      }

      case 'message_update': {
        const delta = event.assistantMessageEvent
        if (!this.#messageId) return []

        // Thinking arrives as its own deltas, so the transcript can show where
        // the model's head is while it is still there rather than a spinner
        // and then a wall of it.
        if (delta.type === 'thinking_start') {
          this.#thinkingAt = Date.now()
          return [{ kind: 'reasoning-start', id: `${this.#messageId}-think` }]
        }
        if (delta.type === 'thinking_delta') {
          return [
            { kind: 'reasoning-delta', id: `${this.#messageId}-think`, text: delta.delta },
          ]
        }
        if (delta.type === 'thinking_end') {
          const ms = this.#thinkingAt === null ? 0 : Date.now() - this.#thinkingAt
          this.#thinkingAt = null
          return [{ kind: 'reasoning-end', id: `${this.#messageId}-think`, ms }]
        }

        if (delta.type !== 'text_delta') return []
        return [{ kind: 'agent-message-delta', id: this.#messageId, text: delta.delta }]
      }

      case 'message_end': {
        const events: UiEvent[] = []
        // A turn cut short mid-thought never sends `thinking_end`. Closing it
        // here is what stops a reasoning block streaming forever.
        if (this.#messageId && this.#thinkingAt !== null) {
          events.push({
            kind: 'reasoning-end',
            id: `${this.#messageId}-think`,
            ms: Date.now() - this.#thinkingAt,
          })
          this.#thinkingAt = null
        }
        if (this.#messageId) {
          events.push({ kind: 'agent-message-end', id: this.#messageId })
          this.#messageId = null
        }

        // pi reports a refused or broken model call as a normal message with an
        // error stop reason — there is no error event to listen for. Without
        // this, a turn that never ran would look like a turn that succeeded.
        const message = event.message as { stopReason?: string; errorMessage?: string }
        if (message.stopReason === 'error') {
          this.#outcome = 'failed'
          events.push({
            kind: 'thread-state',
            state: 'failed',
            reason: message.errorMessage ?? 'the model call failed',
          })
        } else if (message.stopReason === 'aborted') {
          this.#outcome = 'aborted'
        }

        return events
      }

      case 'tool_execution_start':
        // A question is published by the gate, with the card as its record, so
        // a tool row beside it would say the same thing twice in the wrong
        // words. A call the gate refused never became a card, and is left as
        // the row it would otherwise have been.
        if (event.toolName === ASK_TOOL && askable(event.args)) {
          this.#asked.add(event.toolCallId)
          return []
        }
        this.#open.add(event.toolCallId)
        return [
          {
            kind: 'tool-start',
            id: event.toolCallId,
            tool: toolKind(event.toolName),
            target: toolTarget(event.toolName, event.args),
            ...(toolDetail(event.toolName) ? { detail: toolDetail(event.toolName) } : {}),
          },
        ]

      case 'tool_execution_end': {
        if (this.#asked.delete(event.toolCallId)) return []
        this.#open.delete(event.toolCallId)
        const events: UiEvent[] = []
        // A file the driver was watching answers for itself: the diff is the
        // two snapshots, not anything pi said about them.
        const change = this.#takeChange(event.toolCallId)
        const changed = change ? diffOf(change) : null
        const body = changed ? changed.body : toolBody(event.toolName, event.result)
        if (body) events.push({ kind: 'tool-body', id: event.toolCallId, body })

        const blocked = this.#wasBlocked(event.toolCallId)
        events.push({
          kind: 'tool-end',
          id: event.toolCallId,
          status: blocked ? 'denied' : event.isError ? 'fail' : 'ok',
          meta: blocked
            ? 'denied'
            : event.toolName === FETCH_TOOL
              ? fetchMeta(event.result)
              : (lspMeta(event.toolName, event.result) ?? changed?.meta ?? undefined),
        })
        return events
      }

      // pi retries transient provider failures itself, so the app does not
      // implement a retry loop — it reports the one already happening.
      case 'auto_retry_start':
        return [
          {
            kind: 'connectivity',
            state: 'degraded',
            retryInSeconds: Math.max(1, Math.round(event.delayMs / 1000)),
          },
        ]

      case 'auto_retry_end':
        if (event.success) return [{ kind: 'connectivity', state: 'restored' }]
        // Out of retries: this is now a hard failure the user must act on.
        this.#outcome = 'failed'
        return [
          { kind: 'connectivity', state: 'restored' },
          {
            kind: 'thread-state',
            state: 'failed',
            reason: event.finalError ?? 'the provider kept failing',
          },
        ]

      // Every user message is a point the thread can be rewound to. Marking it
      // live as well as on replay means a thread you just watched has the same
      // restore points as one you reopened.
      case 'entry_appended': {
        const entry = event.entry as { type?: string; id?: string; message?: unknown }
        if (entry.type !== 'message' || !entry.id) return []

        const message = entry.message as { role?: string; content?: unknown }
        if (message?.role !== 'user') return []

        const parts = Array.isArray(message.content) ? message.content : []
        const text = joinTextParts(parts)
        return text ? [{ kind: 'checkpoint', id: entry.id, label: text.slice(0, 60) }] : []
      }

      // Compaction is translated here rather than raised by the compact command,
      // because pi also compacts on its own when the context fills up. Handling
      // only the command would leave those automatic runs invisible.
      case 'compaction_start': {
        this.#compactions += 1
        return [{ kind: 'compaction-start', id: `compaction-${this.#compactions}` }]
      }

      case 'compaction_end': {
        const id = `compaction-${this.#compactions}`
        if (!event.result) {
          // Refusing to compact a small session is an answer, not a failure —
          // reporting it as a broken thread would be a lie. It carries the same
          // id as the start it ends, so the running divider actually stops.
          return [
            {
              kind: 'compaction-skipped',
              id,
              reason: event.errorMessage ?? (event.aborted ? 'aborted' : 'nothing to compact'),
            },
          ]
        }

        const window = this.#contextWindow()
        const percent = (tokens: number | undefined): number =>
          window && tokens ? Math.round((tokens / window) * 1000) / 10 : 0

        return [
          {
            kind: 'compaction-done',
            id,
            beforePercent: percent(event.result.tokensBefore),
            afterPercent: percent(event.result.estimatedTokensAfter),
            summary: event.result.summary,
          },
        ]
      }

      // Streaming tool output and turn boundaries carry nothing the ledger shows
      // yet; usage is emitted by the driver, which can read the session's stats.
      case 'tool_execution_update':
      case 'turn_start':
      case 'turn_end':
      case 'agent_settled':
        return []

      default:
        return [{ kind: 'raw', rawKind: (event as { type: string }).type }]
    }
  }
}
