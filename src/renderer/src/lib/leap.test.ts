import { describe, expect, it } from 'vitest'
import {
  LEAP_LABELS,
  findMatches,
  groupCount,
  isCaseSensitive,
  labelAt,
  matchForLabel,
  wrapGroup,
} from './leap'

describe('smartcase', () => {
  it('reads an all-lowercase pattern as case-blind', () => {
    expect(isCaseSensitive('is')).toBe(false)
    expect(findMatches('This is', 'is')).toEqual([2, 5])
  })

  it('takes one capital as a request for exactness', () => {
    expect(isCaseSensitive('Sy')).toBe(true)
    expect(findMatches('runSync and sync', 'Sy')).toEqual([3])
    expect(findMatches('runSync and sync', 'sy')).toEqual([3, 12])
  })

  it('is not confused by a pattern that has no letters', () => {
    expect(isCaseSensitive('()')).toBe(false)
    expect(findMatches('runSync()', '()')).toEqual([7])
  })
})

describe('findMatches', () => {
  it('finds every occurrence, including overlapping ones', () => {
    // Two places the reader can see are two places they can mean.
    expect(findMatches('aaa', 'aa')).toEqual([0, 1])
  })

  it('has nothing to find in an empty pattern', () => {
    expect(findMatches('anything', '')).toEqual([])
  })

  it('reports nothing rather than throwing when there is no match', () => {
    expect(findMatches('hello', 'zz')).toEqual([])
  })
})

describe('labels', () => {
  it('names the first matches in home-row order', () => {
    expect(labelAt(0, 0)).toBe('s')
    expect(labelAt(1, 0)).toBe('f')
    expect(labelAt(2, 0)).toBe('n')
  })

  it('hides a match that is on another page', () => {
    expect(labelAt(LEAP_LABELS.length, 0)).toBeNull()
    expect(labelAt(LEAP_LABELS.length, 1)).toBe('s')
  })

  it('reuses the alphabet per page rather than growing to two keys', () => {
    const second = Array.from({ length: LEAP_LABELS.length }, (_, i) =>
      labelAt(LEAP_LABELS.length + i, 1),
    )
    expect(second.join('')).toBe(LEAP_LABELS)
  })

  it('counts the pages a set of matches needs', () => {
    expect(groupCount(0)).toBe(0)
    expect(groupCount(1)).toBe(1)
    expect(groupCount(LEAP_LABELS.length)).toBe(1)
    expect(groupCount(LEAP_LABELS.length + 1)).toBe(2)
  })

  it('wraps at both ends rather than sticking', () => {
    const many = LEAP_LABELS.length * 2 + 1

    expect(wrapGroup(3, many)).toBe(0)
    expect(wrapGroup(-1, many)).toBe(2)
    // One page is no paging at all.
    expect(wrapGroup(5, 3)).toBe(0)
  })
})

describe('matchForLabel', () => {
  it('names the match a label means on the page being shown', () => {
    expect(matchForLabel('s', 0, 5)).toBe(0)
    expect(matchForLabel('n', 0, 5)).toBe(2)
  })

  it('offsets by the page', () => {
    expect(matchForLabel('s', 1, LEAP_LABELS.length + 3)).toBe(LEAP_LABELS.length)
  })

  it('refuses a key that is not a label', () => {
    expect(matchForLabel('1', 0, 5)).toBeNull()
    expect(matchForLabel('S', 0, 5)).toBeNull()
  })

  it('refuses a label past the end of the matches', () => {
    // The page has room for 26 but only 5 matches exist.
    expect(matchForLabel('h', 0, 5)).toBeNull()
  })
})
