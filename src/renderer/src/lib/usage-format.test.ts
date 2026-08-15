import { describe, expect, it } from 'vitest'
import { formatCost, formatTokens, formatUsage } from './usage-format'

describe('token counts', () => {
  it('writes small counts exactly', () => {
    expect(formatTokens(0)).toBe('0 tok')
    expect(formatTokens(834)).toBe('834 tok')
    expect(formatTokens(999)).toBe('999 tok')
  })

  it('abbreviates thousands to one decimal', () => {
    expect(formatTokens(1000)).toBe('1k tok')
    expect(formatTokens(12_431)).toBe('12.4k tok')
    expect(formatTokens(999_400)).toBe('999.4k tok')
  })

  it('abbreviates millions', () => {
    expect(formatTokens(1_000_000)).toBe('1m tok')
    expect(formatTokens(2_350_000)).toBe('2.4m tok')
  })

  it('drops a trailing zero rather than writing 12.0k', () => {
    expect(formatTokens(12_000)).toBe('12k tok')
  })

  it('says nothing for a number it cannot trust', () => {
    expect(formatTokens(Number.NaN)).toBe('')
    expect(formatTokens(-5)).toBe('')
  })
})

describe('cost', () => {
  it('keeps cents, because a free turn and a three-cent turn differ', () => {
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(0.31)).toBe('$0.31')
    expect(formatCost(0.005)).toBe('$0.01')
    expect(formatCost(12.5)).toBe('$12.50')
  })

  it('says nothing for a number it cannot trust', () => {
    expect(formatCost(Number.NaN)).toBe('')
    expect(formatCost(-1)).toBe('')
  })
})

describe('the whole segment', () => {
  it('joins the two facts', () => {
    expect(formatUsage({ tokens: 12_431, costUsd: 0.31 })).toBe('12.4k tok · $0.31')
  })

  it('stays blank for a thread that has not run a turn', () => {
    // Zeros would read as a measurement rather than the absence of one.
    expect(formatUsage(undefined)).toBe('')
  })

  it('still reports a turn that cost nothing', () => {
    expect(formatUsage({ tokens: 120, costUsd: 0 })).toBe('120 tok · $0.00')
  })
})
