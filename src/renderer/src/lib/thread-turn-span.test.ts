import { describe, expect, it, vi } from 'vitest'
import { reduceThread } from './thread-reducer'
import { EMPTY_THREAD, type ThreadRunState, type ThreadViewModel } from './thread'

const state = (model: ThreadViewModel, one: ThreadRunState): ThreadViewModel =>
  reduceThread(model, { kind: 'thread-state', state: one })

describe('timing a turn', () => {
  it('does not time a thread that has not run', () => {
    expect(EMPTY_THREAD.turn).toBeUndefined()
    expect(state(EMPTY_THREAD, 'idle').turn).toBeUndefined()
  })

  it('starts on the way into running', () => {
    const model = state(EMPTY_THREAD, 'running')

    expect(model.turn?.startedAt).toBeGreaterThan(0)
    expect(model.turn?.endedAt).toBeUndefined()
  })

  it('keeps one clock across a turn that pauses for an answer', () => {
    // `running` arrives again after a gate is answered. Restarting there would
    // report the last stretch rather than the turn.
    const started = state(EMPTY_THREAD, 'running')
    const asked = state(started, 'waiting-input')
    const resumed = state(asked, 'running')

    expect(asked.turn).toBe(started.turn)
    expect(resumed.turn?.startedAt).toBe(started.turn?.startedAt)
    expect(resumed.turn?.endedAt).toBeUndefined()
  })

  it('stops on the way out, and says how it stopped', () => {
    for (const [ending, outcome] of [
      ['done', 'done'],
      ['failed', 'failed'],
      ['idle', 'stopped'],
      ['interrupted', 'stopped'],
    ] as [ThreadRunState, string][]) {
      const model = state(state(EMPTY_THREAD, 'running'), ending)

      expect(model.turn?.endedAt).toBeGreaterThanOrEqual(model.turn?.startedAt ?? 0)
      expect(model.turn?.outcome).toBe(outcome)
    }
  })

  it('does not re-close a turn that already ended', () => {
    const done = state(state(EMPTY_THREAD, 'running'), 'done')
    const again = state(done, 'idle')

    expect(again.turn).toBe(done.turn)
  })

  it('times the next turn from its own start', async () => {
    vi.useFakeTimers()
    try {
      const first = state(state(EMPTY_THREAD, 'running'), 'done')
      vi.advanceTimersByTime(5_000)
      const second = state(first, 'running')

      expect(second.turn?.startedAt).toBeGreaterThan(first.turn?.startedAt ?? 0)
      expect(second.turn?.endedAt).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
