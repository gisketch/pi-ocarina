import type { SessionEntry } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiTranslator } from './pi-translate'
import { replayEntries, stripAnsi } from './replay'

/** Session-file shapes, fabricated. Casting keeps fixtures to the fields the
 *  replay actually reads. */
const entries = (...list: unknown[]): SessionEntry[] => list as SessionEntry[]

const message = (id: string, message: unknown): unknown => ({ type: 'message', id, message })

describe('stripAnsi', () => {
  it('removes colour codes', () => {
    expect(stripAnsi('[38;2;140;140;140mdim[0m')).toBe('dim')
  })

  it('leaves ordinary brackets alone', () => {
    expect(stripAnsi('array[0] and [see notes]')).toBe('array[0] and [see notes]')
  })
})

describe('replayEntries', () => {
  it('rebuilds a conversation', () => {
    const events = replayEntries(
      entries(
        { type: 'session' },
        message('u1', { role: 'user', content: [{ type: 'text', text: 'hello' }] }),
        message('a1', { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] }),
      ),
    )

    expect(events.map((event) => event.kind)).toEqual([
      'user-message',
      'agent-message-start',
      'agent-message-delta',
      'agent-message-end',
      'thread-state',
    ])
  })

  it('rebuilds a tool call and its result', () => {
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'a.ts' } }],
        }),
        message('r1', {
          role: 'toolResult',
          toolCallId: 't1',
          toolName: 'read',
          content: [{ type: 'text', text: 'line one' }],
          isError: false,
        }),
      ),
    )

    expect(events[0]).toMatchObject({ kind: 'tool-start', tool: 'read', target: 'a.ts' })
    expect(events[1]).toMatchObject({ kind: 'tool-body' })
    expect(events[2]).toMatchObject({ kind: 'tool-end', status: 'ok' })
  })

  it('marks a failed tool result as failed', () => {
    const events = replayEntries(
      entries(
        message('r1', { role: 'toolResult', toolCallId: 't1', toolName: 'bash', content: [], isError: true }),
      ),
    )

    expect(events[0]).toMatchObject({ kind: 'tool-end', status: 'fail' })
  })

  it('strips terminal colour codes an extension left in the transcript', () => {
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [{ type: 'text', text: 'ocarina[38;2;1;2;3m footer[0m' }],
        }),
      ),
    )

    const delta = events.find((event) => event.kind === 'agent-message-delta')
    expect(delta).toMatchObject({ text: 'ocarina footer' })
  })

  it('drops thinking, exactly as the live stream does', () => {
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'pondering' }, { type: 'text', text: 'answer' }],
        }),
      ),
    )

    const texts = events
      .filter((event) => event.kind === 'agent-message-delta')
      .map((event) => (event.kind === 'agent-message-delta' ? event.text : ''))
    expect(texts).toEqual(['answer'])
  })

  it('ignores session bookkeeping the live stream never shows', () => {
    const events = replayEntries(
      entries({ type: 'session' }, { type: 'model_change' }, { type: 'thinking_level_change' }),
    )

    expect(events).toEqual([{ kind: 'thread-state', state: 'idle' }])
  })

  it('surfaces an entry type it does not know instead of dropping it', () => {
    const events = replayEntries(entries({ type: 'time_travel' }))

    expect(events[0]).toMatchObject({ kind: 'raw', rawKind: 'time_travel' })
  })

  it('reopens a finished thread as done and an empty one as idle', () => {
    const withReply = replayEntries(
      entries(message('a1', { role: 'assistant', content: [{ type: 'text', text: 'hi' }] })),
    )
    const empty = replayEntries(
      entries(message('u1', { role: 'user', content: [{ type: 'text', text: 'hi' }] })),
    )

    expect(withReply.at(-1)).toMatchObject({ state: 'done' })
    expect(empty.at(-1)).toMatchObject({ state: 'idle' })
  })
})

describe('replay matches live', () => {
  /** The same turn, once as it streamed and once as it was stored. If these
   *  drift, a reopened thread stops looking like the thread the user watched. */
  it('produces the same projection as the live translator', () => {
    const translator = new PiTranslator()
    const liveEvents = [
      { type: 'agent_start' },
      { type: 'message_start', message: { role: 'user' } },
      { type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: { path: 'a.ts' } },
      {
        type: 'tool_execution_end',
        toolCallId: 't1',
        toolName: 'read',
        result: { content: [{ type: 'text', text: 'ocarina' }] },
        isError: false,
      },
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'oca' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'rina' } },
      { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } },
      { type: 'agent_end', willRetry: false },
    ]
    const live = liveEvents.flatMap((event) =>
      translator.translate(event as Parameters<PiTranslator['translate']>[0]),
    )

    const replayed = replayEntries(
      entries(
        message('u1', { role: 'user', content: [{ type: 'text', text: 'read it' }] }),
        message('a1', {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'a.ts' } }],
        }),
        message('r1', {
          role: 'toolResult',
          toolCallId: 't1',
          toolName: 'read',
          content: [{ type: 'text', text: 'ocarina' }],
          isError: false,
        }),
        message('a2', { role: 'assistant', content: [{ type: 'text', text: 'ocarina' }] }),
      ),
    )

    expect(shape(replayed)).toEqual(shape(live))
    expect(joined(replayed)).toEqual(joined(live))

    // Lifecycle is the one thing that legitimately differs: live passes through
    // `running`, replay never does. Both must land on the same final state.
    expect(replayed.at(-1)).toEqual(live.at(-1))
  })
})

/** The content a reducer would build: messages and tools, without the lifecycle
 *  events or the user's own text (which the UI echoes locally when live). */
function shape(events: UiEvent[]): string[] {
  const names = events
    .filter((event) => event.kind !== 'user-message' && event.kind !== 'thread-state')
    .map((event) => {
      if (event.kind === 'tool-start') return `tool-start:${event.tool}:${event.target}`
      if (event.kind === 'tool-end') return `tool-end:${event.status}`
      return event.kind
    })

  // Live text arrives in however many chunks the provider sent; replay hands it
  // over whole. The reducer concatenates either way, so run-length collapse the
  // deltas here and let `joined` prove the text itself matches.
  return names.filter(
    (name, index) => name !== 'agent-message-delta' || names[index - 1] !== 'agent-message-delta',
  )
}

function joined(events: UiEvent[]): string {
  return events
    .filter((event) => event.kind === 'agent-message-delta')
    .map((event) => (event.kind === 'agent-message-delta' ? event.text : ''))
    .join('')
}
