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

  it('settles the calls an aborted turn abandoned, as cancelled', () => {
    // pi stops mid-call and reports nothing further, so a row left alone would
    // pulse as running for the rest of the thread's life.
    const translator = new PiTranslator()
    translator.translate(pi({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash', args: {} }))
    translator.translate(pi({ type: 'tool_execution_start', toolCallId: 't2', toolName: 'read', args: {} }))

    expect(translator.abandonOpenTools()).toEqual([
      { kind: 'tool-end', id: 't1', status: 'cancelled' },
      { kind: 'tool-end', id: 't2', status: 'cancelled' },
    ])
  })

  it('does not cancel a call that already finished', () => {
    const translator = new PiTranslator()
    translator.translate(pi({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash', args: {} }))
    translator.translate(
      pi({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: 'ok', isError: false }),
    )

    expect(translator.abandonOpenTools()).toEqual([])
  })

  it('cancels each abandoned call once', () => {
    const translator = new PiTranslator()
    translator.translate(pi({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash', args: {} }))

    expect(translator.abandonOpenTools()).toHaveLength(1)
    expect(translator.abandonOpenTools()).toEqual([])
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
})

describe('a call that changed a file', () => {
  const change = { path: '/w/a.ts', before: 'one\ntwo\n', after: 'one\nTWO\n' }

  const runEdit = (take: (id: string) => typeof change | null) => {
    const translator = new PiTranslator()
    translator.watchChanges(take)
    translator.translate({
      type: 'tool_execution_start',
      toolCallId: 'c1',
      toolName: 'edit',
      args: { path: 'a.ts' },
    } as never)
    return translator.translate({
      type: 'tool_execution_end',
      toolCallId: 'c1',
      toolName: 'edit',
      result: 'ok',
      isError: false,
    } as never)
  }

  it('renders the snapshots rather than what pi said about them', () => {
    const events = runEdit(() => change)
    const body = events.find((event) => event.kind === 'tool-body')

    expect(body).toBeDefined()
    expect(body?.kind === 'tool-body' && body.body.type).toBe('diff')
    if (body?.kind !== 'tool-body' || body.body.type !== 'diff') throw new Error('not a diff')
    expect(body.body.lines.map((line) => `${line.sign}${line.text}`)).toEqual([
      ' one',
      '-two',
      '+TWO',
    ])
  })

  it('counts the change in the row summary', () => {
    const end = runEdit(() => change).find((event) => event.kind === 'tool-end')
    expect(end?.kind === 'tool-end' && end.meta).toBe('+1 −1')
  })

  it('says new file when there was nothing before', () => {
    const end = runEdit(() => ({ path: '/w/n.ts', before: '', after: 'a\nb\n' })).find(
      (event) => event.kind === 'tool-end',
    )
    expect(end?.kind === 'tool-end' && end.meta).toBe('+2 new file')
  })

  it('draws no panel for an edit that changed nothing', () => {
    const same = { path: '/w/a.ts', before: 'x\n', after: 'x\n' }
    expect(runEdit(() => same).some((event) => event.kind === 'tool-body')).toBe(false)
  })

  it('falls back to pi when the driver was not watching', () => {
    // A tool kind we do not snapshot must keep the behaviour it had.
    expect(runEdit(() => null).some((event) => event.kind === 'tool-body')).toBe(false)
  })
})
