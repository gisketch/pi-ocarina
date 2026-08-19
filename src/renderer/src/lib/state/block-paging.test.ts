import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', async () => (await import('./fixtures')).BRIDGE_MOCK)

import { app } from './app.svelte'
import { WORKSPACE } from './fixtures'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'
import { blockFocus, registerBlock } from './block-focus.svelte'
import { registerColumnBody } from './columns'
import { threads } from './threads.svelte'

/** A column whose blocks are estimated until they are measured.
 *
 *  This is the shape that made `ctrl-d` and `ctrl-u` uneven, and it cannot be
 *  reproduced without frames: a block is guessed short, the browser measures
 *  it partway through the scroll, and its own scroll anchoring adds the
 *  difference to `scrollTop` so the visible content does not jump. A scroll
 *  aimed at a number overwrites that correction; one aimed at a block on
 *  screen absorbs it. */
function column(viewport: number) {
  const body = {
    scrollTop: 0,
    clientHeight: viewport,
    scrollHeight: 10_000,
    getBoundingClientRect: () => ({ top: 0, bottom: viewport }) as DOMRect,
    addEventListener() {},
    removeEventListener() {},
  }

  /** How far everything below the first block moves once that block turns out
   *  to be taller than its estimate. */
  let correction = 0

  const at = (offset: number, shifts: boolean) => ({
    getBoundingClientRect: () => {
      const top = offset + (shifts ? correction : 0) - body.scrollTop
      return { top, bottom: top + 100 } as DOMRect
    },
  })

  const anchor = at(1000, true)
  const offs = [
    registerColumnBody('s1', body as unknown as HTMLElement),
    registerBlock('s1', 'u1', at(0, false) as unknown as HTMLElement),
    registerBlock('s1', 'a1', anchor as unknown as HTMLElement),
    registerBlock('s1', 'l1:r1', at(1200, true) as unknown as HTMLElement),
  ]

  return {
    body,
    /** Where the reader is, measured against a block rather than against
     *  `scrollTop` — the only honest measure while the estimates above it are
     *  still being corrected. */
    seen: () => Math.round(anchor.getBoundingClientRect().top),
    /** The measurement, and the scroll anchoring that comes with it. */
    measure(grew: number) {
      correction = grew
      body.scrollTop += grew
    },
    release: () => offs.forEach((off) => off()),
  }
}

beforeEach(() => {
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'OCARINA'
  threads.seed('s1', {
    blocks: [
      { kind: 'user', id: 'u1', text: 'hello' },
      { kind: 'agent', id: 'a1', text: 'sure' },
      { kind: 'user', id: 'l1:r1', text: 'and again' },
    ],
    status: 'idle',
    runState: 'idle',
  })
  blockFocus.forget('s1')
})

/** Drives frames one at a time, the way a browser does.
 *
 *  A stub that calls the frame back the moment it is asked for runs the whole
 *  animation inside the first request, so nothing between frames can be
 *  observed or changed — and what this is about is what happens *between* two
 *  frames. */
function frames() {
  let queued: ((now: number) => void) | null = null
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
    queued = step
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    queued = null
  })
  // Time belongs to the test. The scroll reads real time twice — its easing
  // curve, and a 320ms watchdog that lands the scroll straight if no frame
  // arrives — and a loaded machine can spend that whole budget between two
  // stubbed frames, landing the scroll mid-test and failing it with numbers
  // from a layout the frames never drove. Inert timers and a clock that only
  // `run` advances make the frames the only thing that happens.
  vi.stubGlobal('setTimeout', () => 0 as unknown as ReturnType<typeof setTimeout>)
  vi.stubGlobal('clearTimeout', () => {})
  vi.stubGlobal('performance', { now: () => now } as Performance)

  return {
    /** Runs up to `count` frames at about 60hz. `before` happens between the
     *  last frame and this one, which is where a measurement lands; `after`
     *  sees what the frame did. */
    run(count: number, before?: (at: number) => void, after?: (at: number) => void) {
      for (let at = 1; at <= count; at += 1) {
        const step = queued
        if (!step) return
        queued = null
        before?.(at)
        // Monotonic across every `run`: a second press reads the clock where
        // the first left it, the way a browser's does.
        now += 16
        step(now)
        after?.(at)
      }
    },
  }
}

describe('ctrl-d and ctrl-u', () => {
  it('moves the view half a column, whatever the estimates do mid-scroll', () => {
    const view = column(400)
    view.body.scrollTop = 1000
    const clock = frames()

    const before = view.seen()
    shell.handleKey({ key: 'd', ctrlKey: true })
    // The block above is measured a third of the way through, and turns out to
    // be 600px taller than it was guessed.
    clock.run(16, (at) => { if (at === 3) view.measure(600) })

    // Half of 400, and no more. Aimed at a number instead, the 600px
    // correction lands in the answer and the view goes the other way.
    expect(before - view.seen()).toBe(200)

    // And a press back up undoes exactly one press down, which is the part a
    // reader feels: an up that took three downs to cancel.
    shell.handleKey({ key: 'u', ctrlKey: true })
    clock.run(16)
    expect(view.seen()).toBe(before)

    vi.unstubAllGlobals()
    view.release()
  })

  it('never doubles back, however late the measurement lands', () => {
    const view = column(400)
    view.body.scrollTop = 1000
    const clock = frames()

    const seen: number[] = []
    shell.handleKey({ key: 'd', ctrlKey: true })
    clock.run(
      16,
      (at) => { if (at === 3) view.measure(600) },
      () => seen.push(view.seen()),
    )

    // A scroll down moves the block up, and only up. Interpolating from a
    // fixed origin instead, the frame that carries the correction throws the
    // view forward and the rest of the curve drags it back — one lurch out and
    // one glide back, which is what a reader feels as rubber banding.
    const back = seen.filter((at, i) => i > 0 && at > seen[i - 1])
    expect(back).toEqual([])
    expect(seen[seen.length - 1]).toBe(-200)

    vi.unstubAllGlobals()
    view.release()
  })
})

// The spec: in READ the chord carries the ring, and the ring never scrolls.
describe('the ring while paging in READ', () => {
  it('lands on the topmost block once the view has travelled', () => {
    const view = column(400)
    view.body.scrollTop = 1000
    app.mode = 'READ'
    blockFocus.set('s1', 'a1')
    const clock = frames()

    // 200px of travel puts the block at 1200 on the top line, and it is the
    // first whose head is at or below it.
    shell.handleKey({ key: 'd', ctrlKey: true })
    expect(blockFocus.idOf('s1')).toBe('l1:r1')

    // The band moved in the same frame as the key, before any frame ran.
    clock.run(16)
    expect(view.seen()).toBe(-200)

    app.mode = 'OCARINA'
    vi.unstubAllGlobals()
    view.release()
  })

  it('takes the end it is heading for when the view cannot cover a page', () => {
    const view = column(400)
    // 100px short of a page from the bottom of the content.
    view.body.scrollHeight = 1500
    view.body.scrollTop = 1000
    app.mode = 'READ'
    blockFocus.set('s1', 'u1')
    const clock = frames()

    shell.handleKey({ key: 'd', ctrlKey: true })
    expect(blockFocus.idOf('s1')).toBe('l1:r1')
    clock.run(16)

    app.mode = 'OCARINA'
    vi.unstubAllGlobals()
    view.release()
  })

  it('leaves the ring alone from NORMAL — skimming is not pointing', () => {
    const view = column(400)
    view.body.scrollTop = 1000
    app.mode = 'OCARINA'
    const clock = frames()

    shell.handleKey({ key: 'd', ctrlKey: true })
    expect(blockFocus.idOf('s1')).toBeNull()
    clock.run(16)

    vi.unstubAllGlobals()
    view.release()
  })
})

describe('G with a ring out', () => {
  it('moves the ring to the newest block, so j/k resume from the end', () => {
    const view = column(400)
    app.mode = 'READ'
    blockFocus.set('s1', 'u1')
    const clock = frames()

    shell.handleKey({ key: 'G' })
    expect(blockFocus.idOf('s1')).toBe('l1:r1')
    clock.run(16)

    app.mode = 'OCARINA'
    view.release()
    vi.unstubAllGlobals()
  })

  it('leaves a reader who never navigated without a ring', () => {
    const view = column(400)
    const clock = frames()

    shell.handleKey({ key: 'G' })
    expect(blockFocus.idOf('s1')).toBeNull()
    clock.run(16)

    view.release()
    vi.unstubAllGlobals()
  })
})
