import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', async () => (await import('./fixtures')).BRIDGE_MOCK)

import { app } from './app.svelte'
import { WORKSPACE } from './fixtures'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'
import { registerBlock } from './block-focus.svelte'
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
  app.mode = 'NORMAL'
  threads.seed('s1', {
    blocks: [
      { kind: 'user', id: 'u1', text: 'hello' },
      { kind: 'agent', id: 'a1', text: 'sure' },
    ],
    status: 'idle',
    runState: 'idle',
  })
})

describe('ctrl-d and ctrl-u', () => {
  it('moves the view half a column, whatever the estimates do mid-scroll', () => {
    const view = column(400)
    view.body.scrollTop = 1000

    // Frame two is where the block above is measured and turns out to be 600px
    // taller than it was guessed.
    let frames = 0
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
      frames += 1
      if (frames === 2) view.measure(600)
      step(performance.now() + (frames < 2 ? 40 : 1000))
      return frames
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const before = view.seen()
    shell.handleKey({ key: 'd', ctrlKey: true })

    // Half of 400, and no more. Aimed at a number instead, the 600px
    // correction lands in the answer and the view goes the other way.
    expect(before - view.seen()).toBe(200)

    // And a press back up undoes exactly one press down, which is the part a
    // reader feels: an up that took three downs to cancel.
    frames = 0
    shell.handleKey({ key: 'u', ctrlKey: true })
    expect(view.seen()).toBe(before)

    vi.unstubAllGlobals()
    view.release()
  })
})
