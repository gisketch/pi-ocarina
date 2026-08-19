import { describe, expect, it } from 'vitest'
import {
  ATTACHED_GROUP_MIN_WIDTH,
  ATTACHED_GROUP_WIDTH,
  COLUMN_GAP,
  COLUMN_STEP,
  COLUMN_WIDTH,
  clampThread,
  paneGroupIsNarrow,
  paneGroupWidth,
  stripGroupOffset,
  stripOffset,
} from './strip'

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

  it('centres the whole attached group among ordinary columns', () => {
    const widths = [COLUMN_WIDTH, ATTACHED_GROUP_WIDTH, COLUMN_WIDTH]
    expect(stripGroupOffset(widths, 0)).toBe(-390)
    expect(stripGroupOffset(widths, 1)).toBe(-(780 + 22 + 585))
    expect(stripGroupOffset(widths, 2)).toBe(-(780 + 22 + 1170 + 22 + 390))
  })

  it('keeps the 2:1 group until its usable minimum, then swaps one full column', () => {
    expect(paneGroupWidth(true, 1400)).toBe(ATTACHED_GROUP_WIDTH)
    expect(paneGroupWidth(true, 1000)).toBe(1000)
    expect(paneGroupWidth(true, ATTACHED_GROUP_MIN_WIDTH)).toBe(960)
    expect(paneGroupWidth(true, 959)).toBe(COLUMN_WIDTH)
    expect(paneGroupIsNarrow(959)).toBe(true)
    expect(paneGroupIsNarrow(960)).toBe(false)
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
