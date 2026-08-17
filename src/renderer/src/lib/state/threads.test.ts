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

describe('loading history', () => {
  it('is not loaded before the backend has answered', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockReturnValue(new Promise(() => {}) as never)

    threads.follow(id)

    expect(threads.isLoaded(id)).toBe(false)
  })

  it('is loaded as soon as the first events arrive', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockReturnValue(new Promise(() => {}) as never)
    threads.follow(id)

    session.ingest([batch(id, 0, [{ kind: 'user-message', id: 'u1', text: 'hi' }])])

    expect(threads.isLoaded(id)).toBe(true)
  })

  it('is loaded once a thread with no history finishes opening', async () => {
    // A brand-new thread is genuinely empty; it must not skeleton forever.
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    threads.follow(id)

    await Promise.resolve()
    await Promise.resolve()

    expect(threads.isLoaded(id)).toBe(true)
    expect(threads.get(id).blocks).toEqual([])
  })

  it('is loaded even when opening failed, so the error can be shown', async () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('unreadable session file'))
    threads.follow(id)

    await Promise.resolve()
    await Promise.resolve()

    expect(threads.isLoaded(id)).toBe(true)
    expect(threads.errorFor(id)).toBe('unreadable session file')
  })

  it('a seeded thread is loaded immediately', () => {
    const id = freshId()
    threads.seed(id, { blocks: [], status: 'idle', runState: 'idle' })

    expect(threads.isLoaded(id)).toBe(true)
  })
})

describe('what the cards do', () => {
  it('sends each decision to the backend with its thread', () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    const answers = [{ id: 'q', kind: 'one' as const, chosen: ['b'], labels: ['B'] }]
    threads.answer(id, 'ask-1', answers)
    threads.resolveApproval(id, 'approve-1', 'always')
    threads.restore(id, 'cp-1')
    threads.cancelSteer(id, 'steer-1')
    threads.compact(id)
    threads.retry(id)

    expect(invoke.mock.calls).toEqual([
      ['answerAsk', { threadId: id, askId: 'ask-1', answers }],
      ['resolveApproval', { threadId: id, approvalId: 'approve-1', outcome: 'always' }],
      ['restoreCheckpoint', { threadId: id, checkpointId: 'cp-1' }],
      ['cancelQueuedSteer', { threadId: id, steerId: 'steer-1' }],
      ['compact', { threadId: id }],
      ['retryTurn', { threadId: id }],
    ])
  })

  it('does not change the thread itself — the backend’s events do that', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    const before = threads.get(id)

    threads.resolveApproval(id, 'approve-1', 'deny')

    expect(threads.get(id)).toBe(before)
  })

  it('reports a command that failed on the thread it belongs to', async () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('thread is not open'))

    threads.restore(id, 'cp-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(threads.errorFor(id)).toBe('thread is not open')
  })

  it('clears a previous failure when a new command is issued', async () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockRejectedValue(new Error('first failure'))
    threads.compact(id)
    await Promise.resolve()
    await Promise.resolve()
    expect(threads.errorFor(id)).toBe('first failure')

    invoke.mockResolvedValue({ ok: true } as never)
    threads.compact(id)

    expect(threads.errorFor(id)).toBeNull()
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

describe('sending', () => {
  it('starts a turn with the text as typed', () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    threads.prompt(id, 'fix the sync worker')

    expect(invoke).toHaveBeenCalledWith('prompt', { threadId: id, text: 'fix the sync worker' })
  })

  it('queues a steer into a running turn', () => {
    const id = freshId()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ steerId: 's1' } as never)

    threads.steer(id, 'also cap retries')

    expect(invoke).toHaveBeenCalledWith('steer', { threadId: id, text: 'also cap retries' })
  })

  it('does not draw the user’s own message — the thread’s events do', () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    threads.prompt(id, 'hello')

    expect(threads.get(id).blocks).toEqual([])
  })

  it('reports a prompt the backend refused', async () => {
    const id = freshId()
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('thread is not open'))

    threads.prompt(id, 'hello')
    await Promise.resolve()
    await Promise.resolve()

    expect(threads.errorFor(id)).toBe('thread is not open')
  })
})
