import { describe, expect, it } from 'vitest'
import { costTier, ctxLabel, reasoningBars } from './models'

describe('ctxLabel', () => {
  it('reads context windows in thousands', () => {
    expect(ctxLabel(200_000)).toBe('200k ctx')
    expect(ctxLabel(64_000)).toBe('64k ctx')
  })

  it('switches to millions where thousands would be unreadable', () => {
    expect(ctxLabel(1_000_000)).toBe('1M ctx')
    expect(ctxLabel(2_500_000)).toBe('2.5M ctx')
  })

  it('says it does not know rather than printing 0k', () => {
    expect(ctxLabel(0)).toBe('ctx ?')
  })
})

describe('costTier', () => {
  it('grades a price into the design’s three tiers', () => {
    expect(costTier(0.3)).toBe('$')
    expect(costTier(3)).toBe('$$')
    expect(costTier(15)).toBe('$$$')
  })

  it('names a free model rather than pricing it', () => {
    expect(costTier(0)).toBe('free')
  })
})

describe('reasoningBars', () => {
  it('always draws four bars', () => {
    expect(reasoningBars(7)).toHaveLength(4)
    expect(reasoningBars(4, 2)).toHaveLength(4)
  })

  it('lights every bar for a model with the full range', () => {
    expect(reasoningBars(7)).toEqual([true, true, true, true])
  })

  it('lights at least one bar for a model that can reason at all', () => {
    expect(reasoningBars(1).filter(Boolean)).toHaveLength(1)
  })

  it('lights none for a model that cannot reason', () => {
    expect(reasoningBars(0)).toEqual([false, false, false, false])
  })

  it('fills proportionally when a tile names its own step', () => {
    expect(reasoningBars(4, 1)).toEqual([true, false, false, false])
    expect(reasoningBars(4, 4)).toEqual([true, true, true, true])
  })
})
