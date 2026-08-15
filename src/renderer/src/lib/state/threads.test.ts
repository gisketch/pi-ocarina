import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventBatch, UiEvent } from '../../../../shared/protocol'
import { PROTOCOL_VERSION } from '../../../../shared/protocol'
import { session } from '../session'
import { threads } from './threads.svelte'

/** The store is a singleton, as it is in the app; each test uses fresh ids. */
let counter = 0
function freshId(): string {
  counter += 1
  return `t-${counter}`
}

function batch(threadId: string, from: number, events: UiEvent[]): EventBatch {
  return { v: PROTOCOL_VERSION, threadId, from, events }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('following a thread', () => {
  it('starts empty', () => {
    expect(threads.get(freshId())).toMatchObject({ blocks: [], status: 'idle' })
  })

  it('asks the backend to replay the thread’s history, once', () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    threads.follow(id)
    threads.follow(id)
    threads.follow(id)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('openThread', { threadId: id })
  })

  it('records why a thread could not be opened instead of failing silently', async () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('no such session file'))

    threads.follow(id)
    await Promise.resolve()
    await Promise.resolve()

    expect(threads.errorFor(id)).toBe('no such session file')
  })

  it('projects the events that arrive for it', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(id)

    session.ingest([
      batch(id, 0, [
        { kind: 'user-message', id: 'u1', text: 'go' },
        { kind: 'thread-state', state: 'running' },
      ]),
    ])

    expect(threads.get(id).blocks).toEqual([{ kind: 'user', id: 'u1', text: 'go' }])
    expect(threads.get(id).status).toBe('running')
  })

  it('accumulates across batches', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(id)

    session.ingest([batch(id, 0, [{ kind: 'agent-message-start', id: 'm1' }])])
    session.ingest([batch(id, 1, [{ kind: 'agent-message-delta', id: 'm1', text: 'hi' }])])

    expect(threads.get(id).blocks[0]).toMatchObject({ text: 'hi' })
  })

  it('keeps one thread’s events out of another', () => {
    const first = freshId()
    const second = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(first)
    threads.follow(second)

    session.ingest([batch(first, 0, [{ kind: 'user-message', id: 'u1', text: 'mine' }])])

    expect(threads.get(first).blocks).toHaveLength(1)
    expect(threads.get(second).blocks).toHaveLength(0)
  })
})

describe('one paint per burst', () => {
  it('replaces the model once for a whole batch, however many events it holds', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(id)

    const seen: unknown[] = []
    const burst: UiEvent[] = [
      { kind: 'agent-message-start', id: 'm1' },
      ...Array.from(
        { length: 60 },
        (_, i): UiEvent => ({ kind: 'agent-message-delta', id: 'm1', text: `${i} ` }),
      ),
    ]

    // Main coalesces a burst into one batch; the store must reduce it whole and
    // assign once, or a 60-token burst becomes 61 renders.
    const before = threads.get(id)
    session.ingest([batch(id, 0, burst)])
    const after = threads.get(id)
    seen.push(before, after)

    expect(before).not.toBe(after)
    expect(after.blocks[0]).toMatchObject({ kind: 'agent', streaming: true })
    expect((after.blocks[0] as { text: string }).text.split(' ')).toHaveLength(61)
  })

  it('does not touch the model when a batch is empty', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(id)

    const before = threads.get(id)
    session.ingest([batch(id, 0, [])])

    expect(threads.get(id)).toBe(before)
  })
})

describe('seeding', () => {
  it('renders a recorded thread without a backend', () => {
    const id = freshId()
    threads.seed(id, {
      blocks: [{ kind: 'user', id: 'u1', text: 'recorded' }],
      status: 'done',
      runState: 'done',
    })

    expect(threads.get(id).blocks).toHaveLength(1)
  })

  it('a seeded thread is not opened again against the backend', () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    threads.seed(id, { blocks: [], status: 'idle', runState: 'idle' })
    threads.follow(id)

    expect(invoke).not.toHaveBeenCalled()
  })
})
