import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore, wrapIndex } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches a subsequence, not only a prefix', () => {
    expect(fuzzyScore('New thread in this workspace', 'ntw')).not.toBeNull()
  })

  it('ignores case', () => {
    expect(fuzzyScore('Docs Site', 'ds')).not.toBeNull()
  })

  it('rejects a query whose letters are not all there', () => {
    expect(fuzzyScore('pi-core', 'xyz')).toBeNull()
  })

  it('rejects letters that appear in the wrong order', () => {
    expect(fuzzyScore('abc', 'cb')).toBeNull()
  })

  it('matches everything against an empty query', () => {
    expect(fuzzyScore('anything', '')).toBe(0)
    expect(fuzzyScore('anything', '   ')).toBe(0)
  })

  it('scores a contiguous match better than a scattered one', () => {
    const contiguous = fuzzyScore('backoff', 'back')
    const scattered = fuzzyScore('b-a-c-k', 'back')
    expect(contiguous).toBeLessThan(scattered as number)
  })
})

describe('fuzzyFilter', () => {
  const names = ['pi-core', 'ocarina-ui', 'docs-site']

  it('keeps only what matches', () => {
    expect(fuzzyFilter(names, 'doc', (name) => name)).toEqual(['docs-site'])
  })

  it('leaves the list untouched for an empty query', () => {
    expect(fuzzyFilter(names, '', (name) => name)).toEqual(names)
  })

  it('puts the best match first', () => {
    // "oc" is contiguous in ocarina-ui and scattered in pi-core.
    expect(fuzzyFilter(names, 'oc', (name) => name)[0]).toBe('ocarina-ui')
  })

  it('keeps the original order when scores tie', () => {
    expect(fuzzyFilter(['aa', 'ab'], 'a', (name) => name)).toEqual(['aa', 'ab'])
  })

  it('returns nothing when nothing matches', () => {
    expect(fuzzyFilter(names, 'zzz', (name) => name)).toEqual([])
  })

  it('reads the text from the item, not from the item itself', () => {
    const items = [{ label: 'alpha' }, { label: 'beta' }]
    expect(fuzzyFilter(items, 'bet', (item) => item.label)).toEqual([{ label: 'beta' }])
  })
})

describe('wrapIndex', () => {
  it('cycles at both ends', () => {
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(-1, 3)).toBe(2)
  })

  it('survives an empty list', () => {
    expect(wrapIndex(2, 0)).toBe(0)
  })
})
