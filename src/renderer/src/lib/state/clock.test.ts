import { afterEach, describe, expect, it, vi } from 'vitest'
import { Clock, clock, type Visibility } from './clock.svelte'

afterEach(() => {
  vi.useRealTimers()
})

describe('the one clock', () => {
  it('does not run when nothing is running', () => {
    expect(clock.ticking).toBe(false)
  })

  it('starts on the first watcher and stops on the last', () => {
    const first = clock.watch()
    const second = clock.watch()
    expect(clock.ticking).toBe(true)

    first()
    expect(clock.ticking).toBe(true)
    second()
    expect(clock.ticking).toBe(false)
  })

  it('ignores a release called twice, so the count cannot go negative', () => {
    const release = clock.watch()
    release()
    release()

    const next = clock.watch()
    expect(clock.ticking).toBe(true)
    next()
    expect(clock.ticking).toBe(false)
  })

  it('advances once a second while anything is watching', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00Z'))

    const release = clock.watch()
    const started = clock.now

    vi.advanceTimersByTime(3_000)
    expect(clock.now - started).toBe(3_000)

    release()
    vi.advanceTimersByTime(5_000)
    expect(clock.now - started).toBe(3_000)
  })
})

describe('a window nobody is looking at', () => {
  function pane(): { visibility: Visibility; hide: () => void; show: () => void } {
    let hidden = false
    const listeners: (() => void)[] = []
    return {
      visibility: { hidden: () => hidden, onChange: (listener) => listeners.push(listener) },
      hide: () => {
        hidden = true
        for (const listener of listeners) listener()
      },
      show: () => {
        hidden = false
        for (const listener of listeners) listener()
      },
    }
  }

  it('does not start a timer behind a hidden window', () => {
    const { visibility, hide } = pane()
    hide()
    const clock = new Clock(visibility)

    const release = clock.watch()
    expect(clock.ticking).toBe(false)
    release()
  })

  it('stops when the window is hidden and starts again when it comes back', () => {
    const { visibility, hide, show } = pane()
    const clock = new Clock(visibility)

    const release = clock.watch()
    expect(clock.ticking).toBe(true)

    hide()
    expect(clock.ticking).toBe(false)

    show()
    expect(clock.ticking).toBe(true)
    release()
  })

  it('stays stopped when it comes back with nothing running', () => {
    const { visibility, hide, show } = pane()
    const clock = new Clock(visibility)

    clock.watch()()
    hide()
    show()
    expect(clock.ticking).toBe(false)
  })

  it('is exact on the first tick after coming back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00Z'))
    const { visibility, hide, show } = pane()
    const clock = new Clock(visibility)

    const release = clock.watch()
    hide()
    vi.advanceTimersByTime(60_000)
    show()

    expect(clock.now).toBe(Date.now())
    release()
  })
})
