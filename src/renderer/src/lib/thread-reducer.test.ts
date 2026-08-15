import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../../shared/protocol'
import { reduceBatch, reduceThread, replayThread } from './thread-reducer'
import { EMPTY_THREAD, type Block, type ToolBody, type ToolRow } from './thread'

function run(...events: UiEvent[]) {
  return replayThread(events)
}

/** The block kinds, in order — the shape assertions read better than indexes. */
function kinds(blocks: Block[]): string[] {
  return blocks.map((block) => block.kind)
}

function rows(blocks: Block[]): ToolRow[] {
  return blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))
}

const start = (id: string): UiEvent => ({ kind: 'agent-message-start', id })
const delta = (id: string, text: string): UiEvent => ({ kind: 'agent-message-delta', id, text })
const tool = (id: string, parentId?: string): UiEvent => ({
  kind: 'tool-start',
  id,
  tool: 'read',
  target: `${id}.ts`,
  parentId,
})

describe('messages', () => {
  it('opens a streaming message and grows it delta by delta', () => {
    const model = run(start('m1'), delta('m1', 'Hel'), delta('m1', 'lo'))

    expect(model.blocks).toEqual([{ kind: 'agent', id: 'm1', text: 'Hello', streaming: true }])
  })

  it('stops streaming when the message ends', () => {
    const model = run(start('m1'), delta('m1', 'hi'), { kind: 'agent-message-end', id: 'm1' })

    expect(model.blocks[0]).toMatchObject({ streaming: false, text: 'hi' })
  })

  it('keeps a delta whose message never started', () => {
    // The words were said; losing them because a start event went missing
    // would misreport the conversation.
    const model = run(delta('m1', 'orphaned but real'))

    expect(model.blocks[0]).toMatchObject({ kind: 'agent', text: 'orphaned but real' })
  })

  it('grows the right message when a tool interrupted it', () => {
    const model = run(start('m1'), delta('m1', 'a'), tool('t1'), delta('m1', 'b'))

    expect(kinds(model.blocks)).toEqual(['agent', 'ledger'])
    expect(model.blocks[0]).toMatchObject({ text: 'ab' })
  })

  it('keeps growing a message when a later block shares its id', () => {
    // Ids come from several sources and are only unique within a kind. Looking
    // one up by id alone let an unrelated block shadow the message, and the
    // delta was dropped without a trace.
    const model = run(
      start('x1'),
      delta('x1', 'a'),
      { kind: 'checkpoint', id: 'x1', label: 'same id' },
      delta('x1', 'b'),
    )

    expect(model.blocks.find((block) => block.kind === 'agent')).toMatchObject({ text: 'ab' })
  })

  it('ends the message, not whatever else shares its id', () => {
    const model = run(
      start('x1'),
      delta('x1', 'hi'),
      { kind: 'checkpoint', id: 'x1', label: 'same id' },
      { kind: 'agent-message-end', id: 'x1' },
    )

    expect(model.blocks[0]).toMatchObject({ kind: 'agent', streaming: false })
  })

  it('keeps user and agent messages in the order they arrived', () => {
    const model = run(
      { kind: 'user-message', id: 'u1', text: 'why?' },
      start('m1'),
      delta('m1', 'because'),
    )

    expect(kinds(model.blocks)).toEqual(['user', 'agent'])
  })
})

describe('ledger grouping', () => {
  it('gathers consecutive tools into one group', () => {
    const model = run(tool('t1'), tool('t2'), tool('t3'))

    expect(kinds(model.blocks)).toEqual(['ledger'])
    expect(rows(model.blocks)).toHaveLength(3)
  })

  it('starts a new group after a message breaks the run', () => {
    const model = run(tool('t1'), start('m1'), tool('t2'))

    expect(kinds(model.blocks)).toEqual(['ledger', 'agent', 'ledger'])
  })

  it('opens a row as running, then settles it', () => {
    const model = run(tool('t1'), { kind: 'tool-end', id: 't1', status: 'ok', meta: '142L' })

    expect(rows(model.blocks)[0]).toMatchObject({ status: 'ok', meta: '142L' })
  })

  it('attaches a body to the row it names', () => {
    const body: ToolBody = { type: 'todo', items: [{ done: true, text: 'x' }] }
    const model = run(tool('t1'), tool('t2'), { kind: 'tool-body', id: 't1', body })

    expect(rows(model.blocks)[0].body).toEqual(body)
    expect(rows(model.blocks)[1].body).toBeUndefined()
  })

  it('updates a running row’s summary without finishing it', () => {
    const model = run(
      tool('t1'),
      { kind: 'tool-progress', id: 't1', meta: 'run 4/10…' },
      { kind: 'tool-progress', id: 't1', meta: 'run 7/10…' },
    )

    expect(rows(model.blocks)[0]).toMatchObject({ status: 'running', meta: 'run 7/10…' })
  })

  it('lets the final result overwrite the last progress line', () => {
    const model = run(tool('t1'), { kind: 'tool-progress', id: 't1', meta: 'run 9/10…' }, {
      kind: 'tool-end',
      id: 't1',
      status: 'ok',
      meta: 'exit 0 · 41s',
    })

    expect(rows(model.blocks)[0]).toMatchObject({ status: 'ok', meta: 'exit 0 · 41s' })
  })

  it('keeps the progress line when the result carries no summary', () => {
    const model = run(tool('t1'), { kind: 'tool-progress', id: 't1', meta: 'run 9/10…' }, {
      kind: 'tool-end',
      id: 't1',
      status: 'cancelled',
    })

    expect(rows(model.blocks)[0]).toMatchObject({ status: 'cancelled', meta: 'run 9/10…' })
  })

  it('settles tools that finish out of order', () => {
    const model = run(
      tool('t1'),
      tool('t2'),
      { kind: 'tool-end', id: 't2', status: 'fail' },
      { kind: 'tool-end', id: 't1', status: 'ok' },
    )

    expect(rows(model.blocks).map((row) => row.status)).toEqual(['ok', 'fail'])
  })

  it('settles a row in an older group, not only the newest', () => {
    const model = run(tool('t1'), start('m1'), tool('t2'), {
      kind: 'tool-end',
      id: 't1',
      status: 'ok',
    })

    expect(rows(model.blocks)[0]).toMatchObject({ id: 't1', status: 'ok' })
  })

  it('shows a result for a tool that never started instead of dropping it', () => {
    const model = run({ kind: 'tool-end', id: 'ghost', status: 'ok' })

    expect(model.blocks[0]).toMatchObject({ kind: 'raw', detail: 'ghost' })
  })
})

describe('subagents', () => {
  it('nests a child row under its parent', () => {
    const model = run(tool('agent1'), tool('child1', 'agent1'))

    const top = rows(model.blocks)
    expect(top).toHaveLength(1)
    expect(top[0].children?.map((row) => row.id)).toEqual(['child1'])
  })

  it('updates two subagents independently while both run', () => {
    const model = run(
      tool('a1'),
      tool('a2'),
      tool('c1', 'a1'),
      tool('c2', 'a2'),
      { kind: 'tool-end', id: 'c1', status: 'ok' },
      { kind: 'tool-end', id: 'c2', status: 'fail' },
    )

    const [first, second] = rows(model.blocks)
    expect(first.children?.[0]).toMatchObject({ status: 'ok' })
    expect(second.children?.[0]).toMatchObject({ status: 'fail' })
  })

  it('never nests deeper than one level', () => {
    // The ledger has one indent; a grandchild joins its parent's row instead.
    const model = run(tool('a1'), tool('c1', 'a1'), tool('g1', 'c1'))

    const parent = rows(model.blocks)[0]
    expect(parent.children?.map((row) => row.id)).toEqual(['c1', 'g1'])
    expect(parent.children?.[0].children).toBeUndefined()
  })

  it('keeps a child whose parent is missing as a row of its own', () => {
    const model = run(tool('orphan', 'nobody'))

    expect(rows(model.blocks).map((row) => row.id)).toEqual(['orphan'])
  })
})

describe('block identity', () => {
  it('identifies a block by its kind and id together', () => {
    // The block list is keyed this way, so two blocks may share an id only if
    // they are of different kinds. A collision within one kind would make the
    // list throw and abandon the render.
    const model = replayThread([
      { kind: 'checkpoint', id: 'e1', label: 'hello' },
      { kind: 'user-message', id: 'user:e1', text: 'hello' },
      { kind: 'checkpoint', id: 'e2', label: 'again' },
      { kind: 'user-message', id: 'user:e2', text: 'again' },
    ])

    const keys = model.blocks.map((block) => `${block.kind}:${block.id}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('replaying a thread that is already on screen', () => {
  it('rebuilds it rather than showing everything twice', () => {
    // A thread closed and opened again still holds its history. Replay states
    // the thread from its beginning, so it resets first.
    const history: UiEvent[] = [
      { kind: 'checkpoint', id: 'e1', label: 'hi' },
      { kind: 'user-message', id: 'user:e1', text: 'hi' },
      { kind: 'agent-message-start', id: 'replay-msg-1' },
      { kind: 'agent-message-delta', id: 'replay-msg-1', text: 'hello' },
      { kind: 'agent-message-end', id: 'replay-msg-1' },
    ]

    const once = replayThread(history)
    const twice = reduceBatch(once, [{ kind: 'thread-reset' }, ...history])

    expect(twice.blocks.map((b) => `${b.kind}:${b.id}`)).toEqual(
      once.blocks.map((b) => `${b.kind}:${b.id}`),
    )
  })
})
