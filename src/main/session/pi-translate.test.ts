import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiTranslator, resultText, toolKind, toolTarget } from './pi-translate'

/** pi's event shapes, fabricated. Casting keeps the fixtures readable without
 *  building whole `AgentMessage` objects the translator never looks at. */
const pi = (event: unknown): AgentSessionEvent => event as AgentSessionEvent

function run(events: unknown[]): UiEvent[] {
  const translator = new PiTranslator()
  return events.flatMap((event) => translator.translate(pi(event)))
}

describe('toolKind', () => {
  it('maps pi built-ins onto design rows', () => {
    expect(toolKind('bash')).toBe('bash')
    expect(toolKind('read')).toBe('read')
    expect(toolKind('grep')).toBe('grep')
  })

  it('leaves tools with no design row as raw rather than mislabelling them', () => {
    expect(toolKind('find')).toBe('raw')
    expect(toolKind('ls')).toBe('raw')
    expect(toolKind('some_extension_tool')).toBe('raw')
  })
})

describe('toolTarget', () => {
  it('labels a file tool with its path', () => {
    expect(toolTarget('read', { path: 'src/app.ts' })).toBe('src/app.ts')
  })

  it('labels bash with the command', () => {
    expect(toolTarget('bash', { command: 'pnpm test' })).toBe('pnpm test')
  })

  it('labels grep with the pattern', () => {
    expect(toolTarget('grep', { pattern: 'TODO' })).toBe('TODO')
  })

  it('still names a tool it does not recognise', () => {
    expect(toolTarget('mystery', { depth: 2 })).toContain('mystery')
  })

  it('survives missing arguments', () => {
    expect(toolTarget('mystery', undefined)).toBe('mystery')
  })
})

describe('resultText', () => {
  it('reads a plain string', () => {
    expect(resultText('hello')).toBe('hello')
  })

  it('reads a content string', () => {
    expect(resultText({ content: 'hello' })).toBe('hello')
  })

  it('joins content parts', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { text: 'b' }] })).toBe('ab')
  })

  it('gives up quietly on shapes it cannot read', () => {
    expect(resultText({ weird: true })).toBe('')
    expect(resultText(null)).toBe('')
  })
})

describe('PiTranslator', () => {
  it('opens and closes an assistant message around its deltas', () => {
    const events = run([
      { type: 'agent_start' },
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hel' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'lo' } },
      { type: 'message_end', message: { role: 'assistant' } },
      { type: 'agent_end', willRetry: false },
    ])

    expect(events.map((event) => event.kind)).toEqual([
      'thread-state',
      'agent-message-start',
      'agent-message-delta',
      'agent-message-delta',
      'agent-message-end',
      'thread-state',
    ])
  })

  it('keeps every delta on the message it belongs to', () => {
    const events = run([
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'a' } },
      { type: 'message_end', message: { role: 'assistant' } },
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'b' } },
    ])

    const ids = events
      .filter((event) => event.kind === 'agent-message-delta')
      .map((event) => (event.kind === 'agent-message-delta' ? event.id : ''))
    expect(ids[0]).not.toBe(ids[1])
  })

  it('ignores user messages, which the UI already showed', () => {
    expect(run([{ type: 'message_start', message: { role: 'user' } }])).toEqual([])
  })

  it('drops thinking deltas rather than rendering them as answer text', () => {
    const events = run([
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' } },
    ])

    expect(events.filter((event) => event.kind === 'agent-message-delta')).toHaveLength(0)
  })

  it('reports a retrying agent as still running, not done', () => {
    const [event] = run([{ type: 'agent_end', willRetry: true }])

    expect(event).toMatchObject({ kind: 'thread-state', state: 'running' })
  })

  it('opens a tool row and settles it', () => {
    const events = run([
      { type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: { path: 'a.ts' } },
      {
        type: 'tool_execution_end',
        toolCallId: 't1',
        toolName: 'read',
        result: { content: 'line one\nline two' },
        isError: false,
      },
    ])

    expect(events[0]).toMatchObject({ kind: 'tool-start', tool: 'read', target: 'a.ts' })
    expect(events[1]).toMatchObject({ kind: 'tool-body' })
    expect(events[2]).toMatchObject({ kind: 'tool-end', status: 'ok' })
  })

  it('marks a failed tool as failed', () => {
    const events = run([
      { type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: '', isError: true },
    ])

    expect(events[0]).toMatchObject({ kind: 'tool-end', status: 'fail' })
  })

  it('marks a call the user refused as denied, not as broken', () => {
    // pi reports every failure the same way, so without the gate's own record
    // "you said no" and "the tool crashed" would look identical in the ledger.
    const translator = new PiTranslator(
      () => undefined,
      (toolCallId) => toolCallId === 't1',
    )

    const [end] = translator.translate(
      pi({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: '', isError: true }),
    )

    expect(end).toMatchObject({ kind: 'tool-end', status: 'denied', meta: 'denied' })
  })

  it('leaves a genuine failure alone', () => {
    const translator = new PiTranslator(
      () => undefined,
      (toolCallId) => toolCallId === 'other',
    )

    const [end] = translator.translate(
      pi({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: '', isError: true }),
    )

    expect(end).toMatchObject({ kind: 'tool-end', status: 'fail' })
  })

  it('renders bash output as terminal lines', () => {
    const events = run([
      {
        type: 'tool_execution_end',
        toolCallId: 't1',
        toolName: 'bash',
        result: 'ok\ndone',
        isError: false,
      },
    ])

    expect(events[0]).toMatchObject({ kind: 'tool-body', body: { type: 'terminal' } })
  })

  it('caps a huge tool body instead of shipping it whole', () => {
    const huge = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
    const events = run([
      { type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: huge, isError: false },
    ])

    const body = events[0].kind === 'tool-body' ? events[0].body : undefined
    expect(body?.type === 'terminal' && body.lines.length).toBeLessThanOrEqual(40)
  })

  it('omits a body when the tool said nothing', () => {
    const events = run([
      { type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', result: '  ', isError: false },
    ])

    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('tool-end')
  })

  it('reports pi retrying a flaky provider as a degraded connection', () => {
    const [event] = run([
      { type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 4000, errorMessage: '503' },
    ])

    expect(event).toMatchObject({ kind: 'connectivity', state: 'degraded', retryInSeconds: 4 })
  })

  it('never shows a countdown of zero seconds', () => {
    const [event] = run([
      { type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 200, errorMessage: 'x' },
    ])

    expect(event).toMatchObject({ retryInSeconds: 1 })
  })

  it('clears the banner when a retry succeeds', () => {
    const events = run([{ type: 'auto_retry_end', success: true, attempt: 2 }])

    expect(events).toEqual([{ kind: 'connectivity', state: 'restored' }])
  })

  it('turns exhausted retries into a failure the user can act on', () => {
    const events = run([
      { type: 'auto_retry_end', success: false, attempt: 3, finalError: 'provider unreachable' },
    ])

    expect(events[0]).toMatchObject({ kind: 'connectivity', state: 'restored' })
    expect(events[1]).toMatchObject({ kind: 'thread-state', state: 'failed' })
    expect(events[1]).toMatchObject({ reason: 'provider unreachable' })
  })

  it('does not then claim the turn finished successfully', () => {
    const events = run([
      { type: 'auto_retry_end', success: false, attempt: 3, finalError: 'nope' },
      { type: 'agent_end', willRetry: false },
    ])

    expect(events.filter((event) => event.kind === 'thread-state')).toHaveLength(1)
  })

  it('reports a finished compaction with before and after percentages', () => {
    const translator = new PiTranslator(() => 200_000)
    const events = [
      { type: 'compaction_start', reason: 'threshold' },
      {
        type: 'compaction_end',
        reason: 'threshold',
        aborted: false,
        willRetry: false,
        result: { summary: 'we did things', tokensBefore: 100_000, estimatedTokensAfter: 20_000 },
      },
    ].flatMap((event) => translator.translate(pi(event)))

    expect(events[0]).toMatchObject({ kind: 'compaction-start' })
    expect(events[1]).toMatchObject({
      kind: 'compaction-done',
      beforePercent: 50,
      afterPercent: 10,
      summary: 'we did things',
    })
  })

  it('pairs a compaction with the run that started it', () => {
    const translator = new PiTranslator(() => 100)
    const first = translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: { summary: 's', tokensBefore: 50, estimatedTokensAfter: 10 },
      }),
    )
    const second = translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))

    expect(first[0].kind === 'compaction-start' && first[0].id).not.toBe(
      second[0].kind === 'compaction-start' && second[0].id,
    )
  })

  it('treats a refused compaction as a note, not a broken thread', () => {
    const translator = new PiTranslator(() => 200_000)
    translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    const events = translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: undefined,
        errorMessage: 'Nothing to compact (session too small)',
      }),
    )

    // Named, and carrying the id of the start it ends — otherwise nothing can
    // stop the running divider the start put on screen.
    expect(events[0]).toMatchObject({
      kind: 'compaction-skipped',
      id: 'compaction-1',
      reason: 'Nothing to compact (session too small)',
    })
    expect(events.some((event) => event.kind === 'thread-state')).toBe(false)
  })

  it('reports zero percentages rather than guessing without a context window', () => {
    const translator = new PiTranslator()
    translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    const [done] = translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: { summary: 's', tokensBefore: 100, estimatedTokensAfter: 10 },
      }),
    )

    expect(done).toMatchObject({ beforePercent: 0, afterPercent: 0 })
  })

  it('surfaces an event kind it has never seen instead of dropping it', () => {
    const events = run([{ type: 'summarization_retry_scheduled', attempt: 2 }])

    expect(events[0]).toMatchObject({ kind: 'raw', rawKind: 'summarization_retry_scheduled' })
  })
})
