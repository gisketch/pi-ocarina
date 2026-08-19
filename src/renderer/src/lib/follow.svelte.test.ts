import { describe, expect, it } from 'vitest'
import { atBottom, BOTTOM_SLACK, Follow } from './follow.svelte'

/** A view 500 tall over content 2000 tall: the bottom is a top of 1500. */
const at = (top: number) => ({ top, height: 500, total: 2000 })

describe('where the bottom is', () => {
  it('is the true bottom', () => {
    expect(atBottom(at(1500))).toBe(true)
  })

  it('has slack, because a pixel short is not a reader scrolling up', () => {
    expect(atBottom(at(1500 - BOTTOM_SLACK))).toBe(true)
    expect(atBottom(at(1500 - BOTTOM_SLACK - 1))).toBe(false)
  })

  it('counts content shorter than the window as at the bottom', () => {
    expect(atBottom({ top: 0, height: 500, total: 200 })).toBe(true)
  })
})

/** The contract that ended the recurring follow bug: **a position can never
 *  pause the follow — only an act can.** The machine moves the view all the
 *  time (a jump's curve, the pin, virtualization corrections, the browser's
 *  own anchoring), and every one of those arrives as a scroll event that
 *  looks exactly like a reader. The old model guessed which was which from
 *  positions and frame counters, and every change to any mover broke the
 *  guess. Now `take()` — wired to the wheel, a drag, a touch, a paging key,
 *  a reveal — is the only way down, and a position report can only re-arm. */
describe('following', () => {
  it('starts on, because a thread opens at what the reader came for', () => {
    expect(new Follow().following).toBe(true)
  })

  it('breaks when the reader takes the view', () => {
    const follow = new Follow()
    follow.take()

    expect(follow.following).toBe(false)
  })

  it('never breaks on a position alone — the machine cannot unfollow', () => {
    const follow = new Follow()
    // A jump's animation, a pin correcting for late-measured blocks, scroll
    // anchoring: all report positions above the bottom, none are the reader.
    follow.scrolled(at(400))
    follow.scrolled(at(900))

    expect(follow.following).toBe(true)
  })

  it('re-arms silently when the view comes back to the bottom', () => {
    const follow = new Follow()
    follow.take()
    follow.arrived(3)
    follow.scrolled(at(1500))

    expect(follow.following).toBe(true)
    expect(follow.unseen).toBe(0)
    expect(follow.showJump).toBe(false)
  })

  it('a taken view stays taken while positions wander', () => {
    const follow = new Follow()
    follow.take()
    follow.scrolled(at(700))
    follow.scrolled(at(1000))

    expect(follow.following).toBe(false)
  })
})

describe('what arrives while they read', () => {
  it('is counted only while paused', () => {
    const follow = new Follow()
    follow.arrived(5)
    expect(follow.unseen).toBe(0)

    follow.take()
    follow.arrived(2)
    follow.arrived()
    expect(follow.unseen).toBe(3)
  })

  it('is what the affordance is for — and it never shows without it', () => {
    const follow = new Follow()
    follow.take()
    expect(follow.showJump).toBe(false)

    follow.arrived()
    expect(follow.showJump).toBe(true)
  })

  it('is cleared by asking to come back', () => {
    const follow = new Follow()
    follow.take()
    follow.arrived(4)
    follow.jump()

    expect(follow.following).toBe(true)
    expect(follow.unseen).toBe(0)
    expect(follow.showJump).toBe(false)
  })
})

describe('a jump that takes time to land', () => {
  it('cannot be broken by its own travel — those positions are nobody’s', () => {
    const follow = new Follow()
    follow.take()
    follow.arrived(3)
    follow.jump()

    follow.scrolled(at(700))
    follow.scrolled(at(1100))
    follow.scrolled(at(1500))

    expect(follow.following).toBe(true)
  })

  it('hands the view back the moment the reader takes it again', () => {
    const follow = new Follow()
    follow.jump()
    follow.scrolled(at(1500))
    follow.take()

    expect(follow.following).toBe(false)
  })
})
