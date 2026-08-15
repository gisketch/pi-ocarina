import { describe, expect, it } from 'vitest'
import { COLUMN_GAP, COLUMN_STEP, COLUMN_WIDTH, clampThread, stripOffset } from './strip'

describe('strip geometry', () => {
  it('uses the reference column metrics', () => {
    expect(COLUMN_WIDTH).toBe(780)
    expect(COLUMN_GAP).toBe(22)
    expect(COLUMN_STEP).toBe(802)
  })

  it('centres the focused column (reference offsets)', () => {
    // The design slides by -(390 + f * 802) from a strip anchored at left:50%.
    expect(stripOffset(0)).toBe(-390)
    expect(stripOffset(1)).toBe(-1192)
    expect(stripOffset(2)).toBe(-1994)
  })

  it('advances by exactly one column step per thread', () => {
    for (let i = 0; i < 6; i++) {
      expect(stripOffset(i + 1) - stripOffset(i)).toBe(-COLUMN_STEP)
    }
  })
})

describe('clampThread', () => {
  it('keeps an index inside the workspace', () => {
    expect(clampThread(-3, 3)).toBe(0)
    expect(clampThread(0, 3)).toBe(0)
    expect(clampThread(2, 3)).toBe(2)
    expect(clampThread(9, 3)).toBe(2)
  })

  it('collapses to 0 for an empty workspace', () => {
    expect(clampThread(4, 0)).toBe(0)
    expect(clampThread(-1, 0)).toBe(0)
  })
})
