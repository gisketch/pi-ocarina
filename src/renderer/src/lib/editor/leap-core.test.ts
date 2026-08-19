import { describe, expect, it } from 'vitest'
import { findLeapTargets, LEAP_LABELS } from './leap-core'

describe('where a leap can land', () => {
  it('finds every match, offset into document positions', () => {
    expect(findLeapTargets('abcabc', 100, 100, 'ab')).toEqual([100, 103])
  })

  it('nearest to the cursor first — the cheapest label names the closest jump', () => {
    const text = 'xx....xx.xx'
    expect(findLeapTargets(text, 0, 9, 'xx')).toEqual([9, 6, 0])
  })

  it('reads case the way the eye does: not at all', () => {
    expect(findLeapTargets('Foo foo FOO', 0, 0, 'fo')).toEqual([0, 4, 8])
  })

  it('counts overlaps — aaa is two places aa can land', () => {
    expect(findLeapTargets('aaa', 0, 0, 'aa')).toEqual([0, 1])
  })

  it('caps at what the labels can name', () => {
    const text = 'ab'.repeat(80)
    expect(findLeapTargets(text, 0, 0, 'ab')).toHaveLength(LEAP_LABELS.length)
  })

  it('is empty for an empty search and for no match', () => {
    expect(findLeapTargets('abc', 0, 0, '')).toEqual([])
    expect(findLeapTargets('abc', 0, 0, 'zz')).toEqual([])
  })
})

describe('the label alphabet', () => {
  it('never repeats a key — a repeated label would be two jumps one key', () => {
    expect(new Set(LEAP_LABELS).size).toBe(LEAP_LABELS.length)
  })

  it('holds only single lowercase keys', () => {
    for (const label of LEAP_LABELS) expect(label).toMatch(/^[a-z]$/)
  })
})
