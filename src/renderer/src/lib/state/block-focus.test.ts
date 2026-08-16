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
})


/** A column of blocks laid out at a fixed pitch, so paging arithmetic can be
 *  checked against numbers rather than against a browser. */
function layout(threadId: string, ids: string[], pitch: number, viewport: number) {
  const body = {
    scrollTop: 0,
    clientHeight: viewport,
    getBoundingClientRect: () => ({ top: -body.scrollTop }) as DOMRect,
    scrollBy() {},
  }
  const offs = [registerColumnBody(threadId, body as unknown as HTMLElement)]

  ids.forEach((id, i) => {
    const el = {
      getBoundingClientRect: () => ({ top: i * pitch - body.scrollTop }) as DOMRect,
      scrollIntoView() {
        body.scrollTop = i * pitch
      },
    }
    offs.push(registerBlock(threadId, id, el as unknown as HTMLElement))
  })

  return { body, release: () => offs.forEach((off) => off()) }
}

describe('paging', () => {
  const ids = ['u1', 'a1', 'l1:r1']

  beforeEach(() => blockFocus.clear('p1'))

  it('lands on the first block at or below the new top', () => {
    // Blocks every 100px, a 400px viewport: half a page is 200px, which is the
    // third block exactly.
    const { body, release } = layout('p1', ids, 100, 400)

    blockFocus.page('p1', list, 1)
    expect(blockFocus.idOf('p1')).toBe('l1:r1')
    expect(body.scrollTop).toBe(200)
    release()
  })

  it('stops at the last block it drew rather than running off the end', () => {
    const { release } = layout('p1', ids, 100, 4000)

    blockFocus.page('p1', list, 1)
    expect(blockFocus.idOf('p1')).toBe('l1:r1')
    release()
  })

  it('comes back up, and stops at the first block', () => {
    const { body, release } = layout('p1', ids, 100, 400)

    blockFocus.page('p1', list, 1)
    blockFocus.page('p1', list, -1)
    expect(blockFocus.idOf('p1')).toBe('u1')
    expect(body.scrollTop).toBe(0)
    release()
  })

  it('moves one block when the column has no measurable page', () => {
    // A terminal column, or one that has not painted: there is no scroll box
    // registered, so there is no half of anything to take.
    blockFocus.page('p2', list, 1)
    expect(blockFocus.idOf('p2')).toBe('u1')
    blockFocus.clear('p2')
  })
})
