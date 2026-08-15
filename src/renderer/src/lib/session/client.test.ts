import { describe, expect, it, vi } from 'vitest'
import { PROTOCOL_VERSION, type EventBatch, type UiEvent } from '../../../../shared/protocol'
import { SessionClient } from './client'

const batch = (threadId: string, from: number, events: unknown[]): EventBatch =>
  ({ v: PROTOCOL_VERSION, threadId, from, events }) as EventBatch

const delta = (text: string): UiEvent => ({ kind: 'agent-message-delta', id: 'm', text })

describe('SessionClient routing', () => {
  it('delivers a thread its own events', () => {
    const client = new SessionClient()
    const seen: UiEvent[][] = []
    client.subscribe('t1', (events) => seen.push(events))

    client.ingest([batch('t1', 0, [delta('a'), delta('b')])])

    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveLength(2)
  })

  it('never leaks one thread into another', () => {
    const client = new SessionClient()
    const one = vi.fn()
    const two = vi.fn()
    client.subscribe('t1', one)
    client.subscribe('t2', two)

    client.ingest([batch('t1', 0, [delta('a')]), batch('t2', 0, [delta('x')])])

    expect(one).toHaveBeenCalledTimes(1)
    expect(two).toHaveBeenCalledTimes(1)
    expect(one.mock.calls[0][0][0]).toMatchObject({ text: 'a' })
    expect(two.mock.calls[0][0][0]).toMatchObject({ text: 'x' })
  })

  it('drops events from an incompatible protocol version', () => {
    const client = new SessionClient()
    const listener = vi.fn()
    client.subscribe('t1', listener)

    client.ingest([{ ...batch('t1', 0, [delta('a')]), v: PROTOCOL_VERSION + 1 }])

    expect(listener).not.toHaveBeenCalled()
  })

  it('renders an unknown event kind instead of dropping it', () => {
    const client = new SessionClient()
    const seen: UiEvent[] = []
    client.subscribe('t1', (events) => seen.push(...events))

    client.ingest([batch('t1', 0, [{ kind: 'from-the-future', detail: 'x' }])])

    expect(seen[0]).toMatchObject({ kind: 'raw', rawKind: 'from-the-future' })
  })

  it('announces a gap rather than hiding lost events', () => {
    const client = new SessionClient()
    const seen: UiEvent[] = []
    client.subscribe('t1', (events) => seen.push(...events))

    client.ingest([batch('t1', 0, [delta('a')])])
    client.ingest([batch('t1', 4, [delta('b')])])

    expect(seen[1]).toMatchObject({ kind: 'raw', rawKind: 'dropped-events' })
    expect(seen[1]).toMatchObject({ detail: expect.stringContaining('3') })
  })

  it('stays quiet when the sequence is continuous', () => {
    const client = new SessionClient()
    const seen: UiEvent[] = []
    client.subscribe('t1', (events) => seen.push(...events))

    client.ingest([batch('t1', 0, [delta('a'), delta('b')])])
    client.ingest([batch('t1', 2, [delta('c')])])

    expect(seen.every((event) => event.kind === 'agent-message-delta')).toBe(true)
  })

  it('stops delivering after unsubscribe', () => {
    const client = new SessionClient()
    const listener = vi.fn()
    const off = client.subscribe('t1', listener)

    off()
    client.ingest([batch('t1', 0, [delta('a')])])

    expect(listener).not.toHaveBeenCalled()
  })

  it('delivers to every subscriber of a thread', () => {
    const client = new SessionClient()
    const one = vi.fn()
    const two = vi.fn()
    client.subscribe('t1', one)
    client.subscribe('t1', two)

    client.ingest([batch('t1', 0, [delta('a')])])

    expect(one).toHaveBeenCalledTimes(1)
    expect(two).toHaveBeenCalledTimes(1)
  })

  it('ignores events for a thread nobody is watching', () => {
    const client = new SessionClient()

    expect(() => client.ingest([batch('ghost', 0, [delta('a')])])).not.toThrow()
  })
})

describe('SessionClient commands', () => {
  it('forwards a command to the backend', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true })
    const client = new SessionClient(send)

    await client.invoke('prompt', { threadId: 't1', text: 'hello' })

    expect(send).toHaveBeenCalledWith('prompt', { threadId: 't1', text: 'hello' })
  })

  it('fails clearly with no backend instead of silently doing nothing', async () => {
    const client = new SessionClient()

    await expect(client.invoke('cancelTurn', { threadId: 't1' })).rejects.toThrow(
      /no session backend/,
    )
  })
})
