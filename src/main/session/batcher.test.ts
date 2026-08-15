import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type EventBatch, type UiEvent } from '../../shared/protocol'
import { EventBatcher } from './batcher'

/** Runs flushes on demand so tests never wait on a timer. */
function manual(): {
  batcher: EventBatcher
  flushes: EventBatch[][]
  tick: () => void
} {
  const flushes: EventBatch[][] = []
  let scheduled: (() => void) | null = null
  const batcher = new EventBatcher(
    (batches) => flushes.push(batches),
    (run) => {
      scheduled = run
    },
  )
  return {
    batcher,
    flushes,
    tick: () => {
      const run = scheduled
      scheduled = null
      run?.()
    },
  }
}

const delta = (text: string): UiEvent => ({ kind: 'agent-message-delta', id: 'm1', text })

describe('EventBatcher', () => {
  it('coalesces a burst into a single flush', () => {
    const { batcher, flushes, tick } = manual()

    for (let i = 0; i < 60; i += 1) batcher.push('t1', delta(String(i)))
    tick()

    expect(flushes).toHaveLength(1)
    expect(flushes[0]).toHaveLength(1)
    expect(flushes[0][0].events).toHaveLength(60)
  })

  it('preserves order within a thread', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('a'))
    batcher.push('t1', delta('b'))
    batcher.push('t1', delta('c'))
    tick()

    const texts = flushes[0][0].events.map((event) =>
      event.kind === 'agent-message-delta' ? event.text : '',
    )
    expect(texts).toEqual(['a', 'b', 'c'])
  })

  it('never mixes two threads into one batch', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('one'))
    batcher.push('t2', delta('two'))
    batcher.push('t1', delta('three'))
    tick()

    const batches = flushes[0]
    expect(batches).toHaveLength(2)

    const first = batches.find((batch) => batch.threadId === 't1')
    const second = batches.find((batch) => batch.threadId === 't2')
    expect(first?.events).toHaveLength(2)
    expect(second?.events).toHaveLength(1)
  })

  it('numbers each thread independently so gaps are detectable', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('a'))
    batcher.push('t1', delta('b'))
    batcher.push('t2', delta('x'))
    tick()

    batcher.push('t1', delta('c'))
    batcher.push('t2', delta('y'))
    tick()

    const seqOf = (round: number, threadId: string): number | undefined =>
      flushes[round].find((batch) => batch.threadId === threadId)?.from

    expect(seqOf(0, 't1')).toBe(0)
    expect(seqOf(0, 't2')).toBe(0)
    expect(seqOf(1, 't1')).toBe(2)
    expect(seqOf(1, 't2')).toBe(1)
  })

  it('stamps the protocol version on every batch', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('a'))
    tick()

    expect(flushes[0][0].v).toBe(PROTOCOL_VERSION)
  })

  it('stays silent when nothing is pending', () => {
    const { batcher, flushes } = manual()

    batcher.flushNow()

    expect(flushes).toHaveLength(0)
  })

  it('reschedules after a flush rather than going quiet', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('a'))
    tick()
    batcher.push('t1', delta('b'))
    tick()

    expect(flushes).toHaveLength(2)
  })

  it('forgets a thread completely', () => {
    const { batcher, flushes, tick } = manual()

    batcher.push('t1', delta('a'))
    tick()
    batcher.forget('t1')
    batcher.push('t1', delta('b'))
    tick()

    expect(flushes[1][0].from).toBe(0)
  })
})
