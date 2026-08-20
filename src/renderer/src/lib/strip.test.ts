import { describe, expect, it } from 'vitest'
import {
  ATTACHED_GROUP_WIDTH,
  ATTACHMENT_WIDTH,
  COLUMN_GAP,
  COLUMN_STEP,
  COLUMN_WIDTH,
  REVEAL_MIN_WIDTH,
  REVEAL_PADDING,
  clampThread,
  memberBoxes,
  paneGroupWidth,
  paneOffset,
  paneRegime,
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

  it('picks the regime at the exact boundaries', () => {
    expect(paneRegime(false, 700)).toBe('full')
    expect(paneRegime(true, 0)).toBe('full')
    expect(paneRegime(true, ATTACHED_GROUP_WIDTH)).toBe('full')
    expect(paneRegime(true, 1169)).toBe('reveal')
    expect(paneRegime(true, REVEAL_MIN_WIDTH)).toBe('reveal')
    expect(paneRegime(true, 819)).toBe('split')
  })

  it('holds member widths constant per regime', () => {
    expect(paneGroupWidth(false)).toBe(COLUMN_WIDTH)
    expect(paneGroupWidth(true, 'full')).toBe(ATTACHED_GROUP_WIDTH)
    expect(paneGroupWidth(true, 'reveal')).toBe(ATTACHED_GROUP_WIDTH)
    expect(paneGroupWidth(true, 'split')).toBe(COLUMN_WIDTH + COLUMN_GAP + ATTACHMENT_WIDTH)
  })

  it('places members by side, gapless until split', () => {
    expect(memberBoxes('right', 'reveal')).toEqual({
      host: { start: 0, width: COLUMN_WIDTH },
      attachment: { start: COLUMN_WIDTH, width: ATTACHMENT_WIDTH },
    })
    expect(memberBoxes('left', 'reveal')).toEqual({
      attachment: { start: 0, width: ATTACHMENT_WIDTH },
      host: { start: ATTACHMENT_WIDTH, width: COLUMN_WIDTH },
    })
    expect(memberBoxes('right', 'split').attachment.start).toBe(COLUMN_WIDTH + COLUMN_GAP)
    expect(memberBoxes('left', 'split').host.start).toBe(ATTACHMENT_WIDTH + COLUMN_GAP)
  })
})

describe('paneOffset', () => {
  const boxes = memberBoxes('right', 'reveal')

  it('centres the whole group in full', () => {
    expect(paneOffset(0, ATTACHED_GROUP_WIDTH, boxes.host, 'full', 1400)).toBe(-585)
  })

  it('reveal keeps the focused host fully visible, partner clipped', () => {
    // Centered would be -585; the host's box [0,780] in a 1000px viewport
    // demands offset ≥ -480 (20px of edge padding), so the group slides
    // right and the terminal hangs off the right edge.
    const offset = paneOffset(0, ATTACHED_GROUP_WIDTH, boxes.host, 'reveal', 1000)
    expect(offset).toBe(-500 + REVEAL_PADDING)
    // Host on screen: [20, 800]; attachment [800, 1190] clipped at 1000.
    expect(1000 / 2 + offset + boxes.host.start).toBe(REVEAL_PADDING)
  })

  it('reveal slides the other way for a focused attachment', () => {
    const offset = paneOffset(0, ATTACHED_GROUP_WIDTH, boxes.attachment, 'reveal', 1000)
    expect(offset).toBe(-670 - REVEAL_PADDING)
    // Attachment right edge lands a padding short of the viewport's right edge.
    expect(1000 / 2 + offset + boxes.attachment.start + boxes.attachment.width).toBe(
      1000 - REVEAL_PADDING,
    )
  })

  it('reveal is a no-op when centring already shows the member', () => {
    // A member sitting mid-group is already inside the centred viewport, so
    // the clamp changes nothing. (Real members touch a group edge, so in
    // practice reveal always slides; the no-op guards the maths.)
    const member = { start: 400, width: 200 }
    expect(paneOffset(0, ATTACHED_GROUP_WIDTH, member, 'reveal', 1000)).toBe(-585)
  })

  it('handles a left-side attachment symmetrically', () => {
    const left = memberBoxes('left', 'reveal')
    const offset = paneOffset(0, ATTACHED_GROUP_WIDTH, left.host, 'reveal', 1000)
    // Host box [390, 1170] must fit padded: offset ≤ 500 - 1170 - 20 = -690.
    expect(offset).toBe(-690)
    expect(1000 / 2 + offset + left.host.start + left.host.width).toBe(1000 - REVEAL_PADDING)
  })

  it('centres the member itself when it outgrows the viewport', () => {
    expect(paneOffset(0, ATTACHED_GROUP_WIDTH, boxes.host, 'reveal', 700)).toBe(-390)
  })

  it('split centres each member alone', () => {
    const split = memberBoxes('right', 'split')
    expect(paneOffset(0, 1192, split.host, 'split', 700)).toBe(-390)
    expect(paneOffset(0, 1192, split.attachment, 'split', 700)).toBe(
      -(COLUMN_WIDTH + COLUMN_GAP + ATTACHMENT_WIDTH / 2),
    )
  })

  it('offsets a later group by everything before it', () => {
    // One plain column, then the group: groupStart = 780 + 22.
    const offset = paneOffset(802, ATTACHED_GROUP_WIDTH, boxes.host, 'reveal', 1000)
    expect(offset).toBe(-500 + REVEAL_PADDING - 802)
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
