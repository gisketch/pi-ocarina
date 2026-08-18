import { beforeEach, describe, expect, it } from 'vitest'
import { reasoningOpen } from './reasoning.svelte'

beforeEach(() => {
  reasoningOpen.forget('t1')
  reasoningOpen.forget('t2')
  if (!reasoningOpen.shown) reasoningOpen.toggleAll()
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

describe('the key that hides the thinking', () => {
  it('takes every reasoning row off the screen, and brings them back', () => {
    expect(reasoningOpen.shown).toBe(true)

    reasoningOpen.toggleAll()
    expect(reasoningOpen.shown).toBe(false)

    reasoningOpen.toggleAll()
    expect(reasoningOpen.shown).toBe(true)
  })

  it('leaves the expansions a reader chose alone', () => {
    // Hiding is not collapsing: what they had open is still open when the
    // rows come back.
    reasoningOpen.toggle('t1', 'r1')
    reasoningOpen.toggleAll()
    reasoningOpen.toggleAll()

    expect(reasoningOpen.isOpen('t1', 'r1')).toBe(true)
  })
})
