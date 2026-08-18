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

describe('following', () => {
  it('starts on, because a thread opens at what the reader came for', () => {
    expect(new Follow().following).toBe(true)
  })

  it('breaks the moment the reader scrolls up', () => {
    const follow = new Follow()
    follow.scrolled(at(900))

    expect(follow.following).toBe(false)
  })

  it('re-arms silently when they scroll back down themselves', () => {
    const follow = new Follow()
    follow.scrolled(at(900))
    follow.arrived(3)
    follow.scrolled(at(1500))

    expect(follow.following).toBe(true)
    expect(follow.unseen).toBe(0)
    expect(follow.showJump).toBe(false)
  })
})

describe('what arrives while they read', () => {
  it('is counted only while paused', () => {
    const follow = new Follow()
    follow.arrived(5)
    expect(follow.unseen).toBe(0)

    follow.scrolled(at(900))
    follow.arrived(2)
    follow.arrived()
    expect(follow.unseen).toBe(3)
  })

  it('is what the affordance is for — and it never shows without it', () => {
    const follow = new Follow()
    follow.scrolled(at(900))
    expect(follow.showJump).toBe(false)

    follow.arrived()
    expect(follow.showJump).toBe(true)
  })

  it('is cleared by asking to come back', () => {
    const follow = new Follow()
    follow.scrolled(at(900))
    follow.arrived(4)
    follow.jump()

    expect(follow.following).toBe(true)
    expect(follow.unseen).toBe(0)
    expect(follow.showJump).toBe(false)
  })
})

describe('a jump that takes time to land', () => {
  it('ignores the positions it passes through on the way down', () => {
    const follow = new Follow()
    follow.scrolled(at(400))
    follow.arrived(3)
    follow.jump()

    // A smooth scroll crosses every position between here and the bottom.
    follow.scrolled(at(700))
    follow.scrolled(at(1100))
    expect(follow.following).toBe(true)

    follow.scrolled(at(1500))
    expect(follow.following).toBe(true)
  })

  it('hands the view back the moment the reader scrolls up again', () => {
    const follow = new Follow()
    follow.jump()
    follow.scrolled(at(1500))
    follow.scrolled(at(400))

    expect(follow.following).toBe(false)
  })
})
