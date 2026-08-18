import { beforeEach, describe, expect, it } from 'vitest'
import { reasoningOpen } from './reasoning.svelte'

beforeEach(() => {
  if (!reasoningOpen.shown) reasoningOpen.toggleAll()
})

describe('the key that hides the thinking', () => {
  it('starts shown — a reader who has not asked sees what the model thought', () => {
    expect(reasoningOpen.shown).toBe(true)
  })

  it('takes every thought off the screen, and brings them back', () => {
    reasoningOpen.toggleAll()
    expect(reasoningOpen.shown).toBe(false)

    reasoningOpen.toggleAll()
    expect(reasoningOpen.shown).toBe(true)
  })
})
