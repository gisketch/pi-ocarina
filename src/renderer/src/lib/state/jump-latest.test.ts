import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', async () => (await import('./fixtures')).BRIDGE_MOCK)

import { registerColumnBody } from './columns'
import { following } from './following.svelte'

/** A thread whose end moves away as it is approached.
 *
 *  The column virtualizes: every block below the fold is a guess until the
 *  scroll brings it into view and the browser measures it, and a real block is
 *  taller than the guess. So `scrollHeight` grows *while* a jump to the end is
 *  travelling, and the end the jump was aimed at is no longer the end. This is
 *  the shape behind the report that `G` takes two or three presses. */
function receding(viewport: number, growth: number[]) {
  let at = 0
  const body = {
    scrollTop: 0,
    clientHeight: viewport,
    scrollHeight: 4000,
    getBoundingClientRect: () => ({ top: 0, bottom: viewport }) as DOMRect,
    addEventListener() {},
    removeEventListener() {},
  }
  const off = registerColumnBody('s1', body as unknown as HTMLElement)

  return {
    body,
    /** One frame's worth of first measurements. */
    measure() {
      body.scrollHeight += growth[at] ?? 0
      at += 1
    },
    release: off,
  }
}

/** Drives frames one at a time, the way a browser does. */
function frames() {
  let queued: ((now: number) => void) | null = null
  vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
    queued = step
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    queued = null
  })

  const base = performance.now()
  return {
    /** Runs `count` frames, whether or not a scroll is still asking for them —
     *  the browser goes on measuring after our animation has given up, and a
     *  driver that stopped with the animation would hide exactly that. Returns
     *  how many frames the scroll actually used. */
    run(count: number, between?: (at: number) => void) {
      let stepped = 0
      for (let at = 1; at <= count; at += 1) {
        between?.(at)
        const step = queued
        if (!step) continue
        queued = null
        stepped += 1
        step(base + at * 16)
      }
      return stepped
    },
  }
}

beforeEach(() => {
  following.forget('s1')
})

describe('the jump to the end', () => {
  it('arrives at the end the thread has, not the one it was aimed at', () => {
    // The thread grows by 200px a frame for twenty frames as the jump crosses
    // it: the tail being measured for the first time, block by block, as the
    // browser paints its way down. Measurement outlasting the scroll is the
    // whole of the report — a fixed budget of correction frames arrives while
    // the end is still moving.
    const view = receding(500, Array.from({ length: 20 }, () => 200))
    const clock = frames()

    following.jump('s1')
    clock.run(60, () => view.measure())

    expect(view.body.scrollTop + view.body.clientHeight).toBe(view.body.scrollHeight)

    // And the press a reader should not have to make: there is nothing left to
    // travel, so the second jump is not a journey.
    const before = view.body.scrollTop
    following.jump('s1')
    clock.run(60)
    expect(view.body.scrollTop).toBe(before)

    vi.unstubAllGlobals()
    view.release()
  })

  it('gives a long travel frames enough to read as one', () => {
    // The distance decides the duration. A jump across thousands of pixels on
    // the same 130ms as a one-block move is a cut, not a scroll.
    const view = receding(500, [])
    const clock = frames()

    following.jump('s1')
    const spent = clock.run(60)

    expect(view.body.scrollTop + view.body.clientHeight).toBe(view.body.scrollHeight)
    // 16ms a frame: comfortably more than the 130ms floor, which would have
    // landed inside nine.
    expect(spent).toBeGreaterThan(12)

    vi.unstubAllGlobals()
    view.release()
  })
})
