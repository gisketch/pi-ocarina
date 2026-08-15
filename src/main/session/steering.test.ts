import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { SteerQueue } from './steering'

function queue(): { queue: SteerQueue; events: { threadId: string; event: UiEvent }[] } {
  const events: { threadId: string; event: UiEvent }[] = []
  return { queue: new SteerQueue((threadId, event) => events.push({ threadId, event })), events }
}

describe('SteerQueue', () => {
  it('announces a steer as pending', () => {
    const { queue: steers, events } = queue()

    const id = steers.add('t1', 'go left')

    expect(events[0].event).toMatchObject({ kind: 'steer-queued', id, text: 'go left' })
    expect(steers.pending('t1')).toBe(1)
  })

  it('gives every steer its own id', () => {
    const { queue: steers } = queue()

    expect(steers.add('t1', 'a')).not.toBe(steers.add('t1', 'b'))
  })

  it('reports delivery once pi stops listing the text', () => {
    const { queue: steers, events } = queue()
    const id = steers.add('t1', 'go left')

    steers.sync('t1', [])

    expect(events[1].event).toMatchObject({ kind: 'steer-delivered', id })
    expect(steers.pending('t1')).toBe(0)
  })

  it('keeps a steer pending while it is still queued', () => {
    const { queue: steers, events } = queue()
    steers.add('t1', 'go left')

    steers.sync('t1', ['go left'])

    expect(events).toHaveLength(1)
    expect(steers.pending('t1')).toBe(1)
  })

  it('delivers only the steer that left the queue', () => {
    const { queue: steers, events } = queue()
    steers.add('t1', 'first')
    const second = steers.add('t1', 'second')

    steers.sync('t1', ['first'])

    const delivered = events.filter((entry) => entry.event.kind === 'steer-delivered')
    expect(delivered).toHaveLength(1)
    expect(delivered[0].event).toMatchObject({ id: second })
  })

  it('does not report the same delivery twice', () => {
    const { queue: steers, events } = queue()
    steers.add('t1', 'go left')

    steers.sync('t1', [])
    steers.sync('t1', [])

    expect(events.filter((entry) => entry.event.kind === 'steer-delivered')).toHaveLength(1)
  })

  it('never mixes one thread’s queue into another', () => {
    const { queue: steers, events } = queue()
    steers.add('t1', 'shared text')
    steers.add('t2', 'shared text')

    steers.sync('t1', [])

    const delivered = events.filter((entry) => entry.event.kind === 'steer-delivered')
    expect(delivered).toHaveLength(1)
    expect(delivered[0].threadId).toBe('t1')
    expect(steers.pending('t2')).toBe(1)
  })

  it('withdraws a steer the user cancelled', () => {
    const { queue: steers, events } = queue()
    const id = steers.add('t1', 'go left')

    steers.cancel('t1', id)

    expect(events[1].event).toMatchObject({ kind: 'steer-cancelled', id })
    expect(steers.pending('t1')).toBe(0)
  })

  it('a cancelled steer is not later reported as delivered', () => {
    const { queue: steers, events } = queue()
    const id = steers.add('t1', 'go left')
    steers.cancel('t1', id)

    steers.sync('t1', [])

    expect(events.some((entry) => entry.event.kind === 'steer-delivered')).toBe(false)
  })

  it('ignores a cancel for something that is not queued', () => {
    const { queue: steers, events } = queue()

    expect(() => steers.cancel('t1', 'steer-99')).not.toThrow()
    expect(events).toEqual([])
  })

  it('forgets a closed thread', () => {
    const { queue: steers } = queue()
    steers.add('t1', 'go left')

    steers.forget('t1')

    expect(steers.pending('t1')).toBe(0)
  })
})
