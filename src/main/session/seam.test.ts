import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionClient } from '../../renderer/src/lib/session/client'
import type { UiEvent } from '../../shared/protocol'
import { EventBatcher } from './batcher'
import { StubDriver } from './stub-driver'

/** Wires the whole seam the way the app does — driver, batcher, transport,
 *  client — so the pieces are proven together and not only in isolation. */
function seam(): {
  driver: StubDriver
  batcher: EventBatcher
  received: Map<string, UiEvent[]>
  flushCount: () => number
  watch: (threadId: string) => void
} {
  const client = new SessionClient()
  const received = new Map<string, UiEvent[]>()
  let flushes = 0

  const batcher = new EventBatcher((batches) => {
    flushes += 1
    // Round-tripped through JSON exactly as the IPC boundary would.
    client.ingest(JSON.parse(JSON.stringify(batches)))
  })
  const driver = new StubDriver((threadId, event) => batcher.push(threadId, event))

  return {
    driver,
    batcher,
    received,
    flushCount: () => flushes,
    watch: (threadId) => {
      received.set(threadId, [])
      client.subscribe(threadId, (events) => received.get(threadId)?.push(...events))
    },
  }
}

describe('session seam end to end', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('carries a scripted turn from driver to renderer', async () => {
    const { driver, received, watch } = seam()
    const { threadId } = await driver.execute('createThread', { workspaceId: 'w1' })
    watch(threadId)

    await driver.execute('prompt', { threadId, text: 'hello' })
    await vi.advanceTimersByTimeAsync(2000)

    const kinds = received.get(threadId)?.map((event) => event.kind) ?? []
    expect(kinds[0]).toBe('user-message')
    expect(kinds).toContain('agent-message-delta')
    expect(kinds).toContain('tool-end')
    expect(kinds.at(-1)).toBe('thread-state')
  })

  it('shows the fixture stream an event kind it does not know', async () => {
    const { driver, received, watch } = seam()
    const { threadId } = await driver.execute('createThread', { workspaceId: 'w1' })
    watch(threadId)

    await driver.execute('prompt', { threadId, text: 'hello' })
    await vi.advanceTimersByTimeAsync(2000)

    const raw = received.get(threadId)?.filter((event) => event.kind === 'raw') ?? []
    expect(raw).toHaveLength(1)
    expect(raw[0]).toMatchObject({ rawKind: 'sonata-experiment' })
  })

  it('runs two threads at once without mixing them', async () => {
    const { driver, received, watch } = seam()
    const first = await driver.execute('createThread', { workspaceId: 'w1' })
    const second = await driver.execute('createThread', { workspaceId: 'w2' })
    watch(first.threadId)
    watch(second.threadId)

    await driver.execute('prompt', { threadId: first.threadId, text: 'alpha' })
    await vi.advanceTimersByTimeAsync(60)
    await driver.execute('prompt', { threadId: second.threadId, text: 'beta' })
    await vi.advanceTimersByTimeAsync(2000)

    const textOf = (threadId: string): string | undefined => {
      const first = received.get(threadId)?.[0]
      return first?.kind === 'user-message' ? first.text : undefined
    }

    expect(textOf(first.threadId)).toBe('alpha')
    expect(textOf(second.threadId)).toBe('beta')
    expect(received.get(first.threadId)?.length).toBe(received.get(second.threadId)?.length)
  })

  it('coalesces the burst into far fewer flushes than events', async () => {
    const { driver, received, watch, flushCount } = seam()
    const { threadId } = await driver.execute('createThread', { workspaceId: 'w1' })
    watch(threadId)

    await driver.execute('prompt', { threadId, text: 'hello' })
    await vi.advanceTimersByTimeAsync(2000)

    const events = received.get(threadId)?.length ?? 0
    expect(events).toBeGreaterThan(10)
    expect(flushCount()).toBeLessThan(events)
  })

  it('stops the stream when the turn is cancelled', async () => {
    const { driver, received, watch } = seam()
    const { threadId } = await driver.execute('createThread', { workspaceId: 'w1' })
    watch(threadId)

    await driver.execute('prompt', { threadId, text: 'hello' })
    await vi.advanceTimersByTimeAsync(50)
    await driver.execute('cancelTurn', { threadId })
    await vi.advanceTimersByTimeAsync(2000)

    const events = received.get(threadId) ?? []
    expect(events.at(-1)).toMatchObject({ kind: 'thread-state', state: 'idle' })
    expect(events.some((event) => event.kind === 'tool-end')).toBe(false)
  })
})
