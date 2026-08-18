import { beforeEach, describe, expect, it } from 'vitest'
import { reasoningOpen } from './reasoning.svelte'

beforeEach(() => {
  reasoningOpen.forget('t1')
  reasoningOpen.forget('t2')
  if (reasoningOpen.byDefault) reasoningOpen.toggleAll()
})

describe('which thoughts are open', () => {
  it('starts closed — the answer is what the reader came for', () => {
    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(false)
  })

  it('opens one block without touching its neighbours', () => {
    reasoningOpen.toggle('t1', 'r1')

    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(true)
    expect(reasoningOpen.isOpen('t1', 'r2')).toBe(false)
  })

  it('keeps threads apart', () => {
    reasoningOpen.toggle('t1', 'r1')
    expect(reasoningOpen.isOpen('t2', 'r1')).toBe(false)
  })

  it('forgets a thread that closed', () => {
    reasoningOpen.toggle('t1', 'r1')
    reasoningOpen.forget('t1')

    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(false)
  })
})

describe('the key that means show me all of this', () => {
  it('opens every block, including ones closed by hand', () => {
    reasoningOpen.toggle('t1', 'r1')
    reasoningOpen.toggle('t1', 'r1')
    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(false)

    reasoningOpen.toggleAll()
    // Otherwise the block they shut earlier stays shut and the key looks
    // broken on the one block they were looking at.
    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(true)
    expect(reasoningOpen.isOpen('t2', 'anything')).toBe(true)
  })

  it('closes them again', () => {
    reasoningOpen.toggleAll()
    reasoningOpen.toggleAll()

    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(false)
  })

  it('still lets one block disagree with the default afterwards', () => {
    reasoningOpen.toggleAll()
    reasoningOpen.toggle('t1', 'r1')

    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(false)
    expect(reasoningOpen.isOpen('t1', 'r2')).toBe(true)
  })
})
