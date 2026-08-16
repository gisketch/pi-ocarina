import { beforeEach, describe, expect, it } from 'vitest'
import { connectivity } from './connectivity.svelte'

beforeEach(() => {
  connectivity.reset()
})

describe('the connectivity banner state', () => {
  it('is down until a thread says otherwise', () => {
    expect(connectivity.degraded).toBe(false)
  })

  it('goes up while a thread is retrying, and reports the wait', () => {
    connectivity.report('t1', 'degraded', 4)

    expect(connectivity.degraded).toBe(true)
    expect(connectivity.retryInSeconds).toBe(4)
  })

  it('comes down when that thread recovers', () => {
    connectivity.report('t1', 'degraded', 4)
    connectivity.report('t1', 'restored')

    expect(connectivity.degraded).toBe(false)
    expect(connectivity.retryInSeconds).toBeUndefined()
  })

  it('stays up while another thread is still retrying', () => {
    // A provider that is failing is failing for every thread, and taking the
    // banner down on the first recovery would say the opposite.
    connectivity.report('t1', 'degraded', 2)
    connectivity.report('t2', 'degraded', 8)

    connectivity.report('t1', 'restored')

    expect(connectivity.degraded).toBe(true)
    expect(connectivity.retryInSeconds).toBe(8)
  })

  it('shows the longest wait, so the countdown never runs out early', () => {
    connectivity.report('t1', 'degraded', 3)
    connectivity.report('t2', 'degraded', 9)

    expect(connectivity.retryInSeconds).toBe(9)
  })

  it('survives a degraded event that carried no wait', () => {
    connectivity.report('t1', 'degraded')

    expect(connectivity.degraded).toBe(true)
    expect(connectivity.retryInSeconds).toBeUndefined()
  })

  it('ignores a recovery for a thread that was never degraded', () => {
    connectivity.report('t1', 'restored')

    expect(connectivity.degraded).toBe(false)
  })
})

describe('retry cycles', () => {
  it('counts every retry, so two with the same wait are still two', () => {
    // A provider that is not backing off reports the same wait twice. Writing
    // the same number changes nothing, and a countdown watching only the wait
    // would sit on zero through the second cycle.
    connectivity.report('t1', 'degraded', 5)
    const first = connectivity.cycle

    connectivity.report('t1', 'degraded', 5)

    expect(connectivity.cycle).toBeGreaterThan(first)
  })

  it('does not count a recovery', () => {
    connectivity.report('t1', 'degraded', 5)
    const counted = connectivity.cycle

    connectivity.report('t1', 'restored')

    expect(connectivity.cycle).toBe(counted)
  })
})
