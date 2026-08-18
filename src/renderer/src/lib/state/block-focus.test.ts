import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blockElement, blockFocus, registerBlock, revealBlock } from './block-focus.svelte'
import { registerColumnBody } from './columns'
import { navBlocks } from '../blocks'
import type { Block } from '../thread'

/** Stands in for a rendered block. The registry only ever hands the element
 *  back or asks it to scroll, so this is the whole of the contract. */
function stubElement(): HTMLElement & { scrolled: number } {
  const el = {
    scrolled: 0,
    scrollIntoView() {
      el.scrolled += 1
    },
  }
  return el as unknown as HTMLElement & { scrolled: number }
}

const blocks: Block[] = [
  { kind: 'user', id: 'u1', text: 'one' },
  { kind: 'agent', id: 'a1', text: 'two' },
  { kind: 'ledger', id: 'l1', rows: [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }] },
]
const list = navBlocks(blocks)

describe('block focus', () => {
  beforeEach(() => {
    blockFocus.clear('t1')
    blockFocus.clear('t2')
  })

  it('starts unfocused, which is what leaves a column undimmed', () => {
    expect(blockFocus.idOf('t1')).toBeNull()
  })

  it('walks the list one block at a time and clamps at both ends', () => {
    blockFocus.move('t1', list, 1)
    expect(blockFocus.idOf('t1')).toBe('u1')

    blockFocus.move('t1', list, 1)
    blockFocus.move('t1', list, 1)
    expect(blockFocus.idOf('t1')).toBe('l1:r1')

    blockFocus.move('t1', list, 1)
    expect(blockFocus.idOf('t1')).toBe('l1:r1')

    blockFocus.move('t1', list, -1)
    expect(blockFocus.idOf('t1')).toBe('a1')
  })

  it('keeps each thread\'s ring to itself', () => {
    blockFocus.move('t1', list, 1)
    expect(blockFocus.idOf('t2')).toBeNull()

    blockFocus.move('t2', list, -1)
    expect(blockFocus.idOf('t1')).toBe('u1')
    expect(blockFocus.idOf('t2')).toBe('l1:r1')
  })

  it('has nothing to move to in an empty thread, and says so by not focusing', () => {
    blockFocus.move('t1', [], 1)
    expect(blockFocus.idOf('t1')).toBeNull()
  })

  it('brings the block it moved to into view', () => {
    const el = stubElement()
    const off = registerBlock('t1', 'u1', el)

    blockFocus.move('t1', list, 1)
    expect(el.scrolled).toBe(1)
    off()
  })

  it('forgets an element when its block is unregistered', () => {
    const el = stubElement()
    const off = registerBlock('t1', 'u1', el)
    expect(blockElement('t1', 'u1')).toBe(el)

    off()
    expect(blockElement('t1', 'u1')).toBeUndefined()
    // Revealing a block nothing drew is a no-op, not a crash: a focused block
    // can scroll out of the DOM while `content-visibility` is doing its work.
    expect(() => revealBlock('t1', 'u1')).not.toThrow()
  })

  it('does not let a stale unregister drop the element that replaced it', () => {
    const first = stubElement()
    const second = stubElement()
    const offFirst = registerBlock('t1', 'u1', first)
    registerBlock('t1', 'u1', second)

    offFirst()
    expect(blockElement('t1', 'u1')).toBe(second)
  })

  it('recovers when the focused block is no longer in the thread', () => {
    blockFocus.set('t1', 'restored-away')
    blockFocus.move('t1', list, 1)
    expect(blockFocus.idOf('t1')).toBe('u1')
  })
})

describe('reveal', () => {
  it('asks for the nearest scroll, so a visible block does not jump', () => {
    const el = stubElement()
    const spy = vi.spyOn(el, 'scrollIntoView')
    const off = registerBlock('t3', 'u1', el)

    revealBlock('t3', 'u1')
    expect(spy).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
    off()
  })

  it('re-aims while it travels, so a block measured late is still what it lands on', () => {
    // A block below the fold is an estimate until the scroll brings it into
    // view. Here the fence above it turns out to be 500px taller than the
    // estimate, one frame in — which is what used to leave the ring pointing at
    // something a screen off the top of the column.
    let frames = 0
    let shift = 0
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
      frames += 1
      if (frames > 1) shift = 500
      step(performance.now() + 1000)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const body = {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 4000,
      getBoundingClientRect: () => ({ top: 0, bottom: 400 }) as DOMRect,
      addEventListener() {},
      removeEventListener() {},
    }
    const el = {
      getBoundingClientRect: () =>
        ({ top: 1000 + shift - body.scrollTop, bottom: 1100 + shift - body.scrollTop }) as DOMRect,
    }
    const offs = [
      registerColumnBody('t4', body as unknown as HTMLElement),
      registerBlock('t4', 'b1', el as unknown as HTMLElement),
    ]

    revealBlock('t4', 'b1')

    // The block is shorter than the column, so the reveal brings its foot up:
    // 1600 once the fence above it is measured, less the 400 of viewport, plus
    // the breathing room. Aimed once, it would have stopped at 710 — with the
    // block it was pointing at 500px below the fold.
    expect(Math.round(body.scrollTop)).toBe(1210)
    offs.forEach((off) => off())
    vi.unstubAllGlobals()
  })
})


/** A column of blocks laid out at a fixed pitch, so paging arithmetic can be
 *  checked against numbers rather than against a browser. */
function layout(threadId: string, ids: string[], pitch: number, viewport: number) {
  // The scroll box sits at the top of the screen and stays there; only its
  // children move, which is how a real scroller reports itself.
  const body = {
    scrollTop: 0,
    clientHeight: viewport,
    // Taller than its blocks by a viewport, so the clamp against the end of
    // the content is not what these cases are measuring.
    scrollHeight: ids.length * pitch + viewport,
    getBoundingClientRect: () => ({ top: 0, bottom: viewport }) as DOMRect,
    addEventListener() {},
    removeEventListener() {},
  }
  const offs = [registerColumnBody(threadId, body as unknown as HTMLElement)]

  ids.forEach((id, i) => {
    const el = {
      getBoundingClientRect: () =>
        ({ top: i * pitch - body.scrollTop, bottom: (i + 1) * pitch - body.scrollTop }) as DOMRect,
    }
    offs.push(registerBlock(threadId, id, el as unknown as HTMLElement))
  })

  return { body, release: () => offs.forEach((off) => off()) }
}

describe('paging', () => {
  const ids = ['u1', 'a1', 'l1:r1']

  beforeEach(() => {
    blockFocus.clear('p1')
    // Scrolling now runs on our own curve rather than the browser's, so the
    // frames have to come from somewhere. One frame, already at the end of the
    // duration: these cases are about where a scroll lands, not how it travels.
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
      step(performance.now() + 1000)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  it('starts the ring at the top of the view, not the top of the thread', () => {
    // Scrolled two blocks down: `j` must not teleport back to the first block
    // of a thread the reader has walked a long way into.
    const { body, release } = layout('p1', ['u1', 'a1', 'l1:r1'], 100, 150)
    body.scrollTop = 200

    blockFocus.move('p1', list, 1)
    expect(blockFocus.idOf('p1')).toBe('l1:r1')
    release()
  })

  it('starts at the bottom of the view when the first press is upwards', () => {
    const { release } = layout('p1', ['u1', 'a1', 'l1:r1'], 100, 250)

    blockFocus.move('p1', list, -1)
    expect(blockFocus.idOf('p1')).toBe('l1:r1')
    release()
  })

  it('falls back to the end of the list when nothing has painted', () => {
    blockFocus.move('unpainted', list, 1)
    expect(blockFocus.idOf('unpainted')).toBe('u1')
    blockFocus.forget('unpainted')
  })

  it('forgets a thread whose column has gone', () => {
    blockFocus.set('p1', 'u1')

    blockFocus.forget('p1')

    expect(blockFocus.idOf('p1')).toBeNull()
  })
})


/** A block drawn the way a message really is: the name above it is not a block
 *  anyone can point at, and it lives outside the element the ring is on. */
function message(threadId: string, navId: string, top: number, body: { scrollTop: number }) {
  const at = (offset: number, height: number) => ({
    getBoundingClientRect: () => ({ top: top + offset - body.scrollTop, bottom: top + offset + height - body.scrollTop }) as DOMRect,
  })

  const seg = { ...at(40, 40), dataset: { navId }, querySelector: () => null } as unknown as HTMLElement
  const label = { ...at(0, 40), dataset: {}, querySelector: () => null } as unknown as HTMLElement
  const text = { ...at(40, 40), dataset: {}, querySelector: () => seg } as unknown as HTMLElement
  const wrapper = { ...at(0, 80), dataset: {}, querySelector: () => seg } as unknown as HTMLElement

  Object.assign(seg, { parentElement: text, previousElementSibling: null })
  Object.assign(text, { parentElement: wrapper, previousElementSibling: label })
  Object.assign(label, { parentElement: wrapper, previousElementSibling: null })

  return { seg, wrapper, register: () => registerBlock(threadId, navId, seg) }
}

describe('what comes into view with a block', () => {
  beforeEach(() => {
    blockFocus.clear('r1')
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) => {
      step(performance.now() + 1000)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  it('brings the name above a message with it', () => {
    // The reader arriving at a paragraph with nobody attached to it is the bug:
    // aligning the block itself puts YOU, or the agent, just off the top.
    const body = {
      scrollTop: 400,
      clientHeight: 200,
      scrollHeight: 2000,
      getBoundingClientRect: () => ({ top: 0, bottom: 200 }) as DOMRect,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLElement & { scrollTop: number }
    const release = [registerColumnBody('r1', body)]

    const first = message('r1', 'u1', 0, body)
    const second = message('r1', 'u2', 300, body)
    Object.assign(second.wrapper, { parentElement: body, previousElementSibling: first.wrapper })
    Object.assign(first.wrapper, { parentElement: body, previousElementSibling: null })
    release.push(first.register(), second.register())

    revealBlock('r1', 'u2')

    // 300 is the top of the message; 340 would be the top of the block alone.
    expect(body.scrollTop).toBe(290)
    release.forEach((off) => off())
  })

  it('brings the name of a turn with it, which is nobody\'s child', () => {
    // The agent's name is drawn above the wrapper rather than inside it, so no
    // ancestor's box is the answer — and the wrapper's own earlier siblings are
    // other people's blocks, which must not stop the reveal short of it.
    const body = {
      scrollTop: 400,
      clientHeight: 200,
      scrollHeight: 2000,
      getBoundingClientRect: () => ({ top: 0, bottom: 200 }) as DOMRect,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLElement & { scrollTop: number }
    const release = [registerColumnBody('r1', body)]

    const first = message('r1', 'u1', 0, body)
    const second = message('r1', 'u2', 320, body)
    const turn = {
      getBoundingClientRect: () => ({ top: 300 - body.scrollTop, bottom: 320 - body.scrollTop }) as DOMRect,
      dataset: {},
      querySelector: () => null,
      parentElement: body,
      previousElementSibling: first.wrapper,
    } as unknown as HTMLElement

    Object.assign(first.wrapper, { parentElement: body, previousElementSibling: null })
    Object.assign(second.wrapper, { parentElement: body, previousElementSibling: turn })
    release.push(first.register(), second.register())

    revealBlock('r1', 'u2')

    // 300 is the name; 320 the message under it; 360 the block on its own.
    expect(body.scrollTop).toBe(290)
    release.forEach((off) => off())
  })
})
