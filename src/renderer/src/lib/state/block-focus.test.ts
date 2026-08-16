import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blockElement, blockFocus, registerBlock, revealBlock } from './block-focus.svelte'
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
