import { describe, expect, it } from 'vitest'
import { LEAP_KEYS, labelsFor, matchLabel } from './leap'

describe('labelsFor', () => {
  it('gives one key per block while the key set covers them', () => {
    expect(labelsFor(5)).toEqual(['a', 's', 'd', 'f', 'j'])
  })

  it('has nothing to label in an empty viewport', () => {
    expect(labelsFor(0)).toEqual([])
    expect(labelsFor(-1)).toEqual([])
  })

  it('moves every label to two keys rather than mixing lengths', () => {
    const labels = labelsFor(LEAP_KEYS.length + 1)

    expect(labels).toHaveLength(LEAP_KEYS.length + 1)
    expect(labels.every((label) => label.length === 2)).toBe(true)
  })

  it('never makes one label the prefix of another', () => {
    for (const count of [3, 19, 20, 40, 200]) {
      const labels = labelsFor(count)
      expect(new Set(labels).size).toBe(labels.length)
      expect(
        labels.some((a) => labels.some((b) => a !== b && b.startsWith(a))),
      ).toBe(false)
    }
  })

  it('gives back what it can rather than throwing when asked for too many', () => {
    const labels = labelsFor(LEAP_KEYS.length ** 2 + 50)
    expect(labels).toHaveLength(LEAP_KEYS.length ** 2)
  })
})

describe('matchLabel', () => {
  const labels = labelsFor(25)

  it('reports the block whose label was typed in full', () => {
    expect(matchLabel(labels, labels[7])).toEqual({ hit: 7, live: true })
  })

  it('waits while a label can still be completed', () => {
    expect(matchLabel(labels, labels[7][0])).toEqual({ hit: null, live: true })
  })

  it('gives up on a key no label can complete', () => {
    expect(matchLabel(labels, 'z')).toEqual({ hit: null, live: false })
  })

  it('gives up on a second key that goes nowhere', () => {
    expect(matchLabel(labels, `${labels[0][0]}z`)).toEqual({ hit: null, live: false })
  })

  it('has nothing to wait for when nothing is labelled', () => {
    expect(matchLabel([], 'a')).toEqual({ hit: null, live: false })
  })
})
