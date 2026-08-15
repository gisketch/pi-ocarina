import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, LEADER_TIMEOUT_RANGE } from '../../../../shared/preferences'
import { preferences } from './preferences.svelte'

beforeEach(() => {
  preferences.apply(DEFAULT_PREFERENCES)
  preferences.reasoning = 'high'
})

describe('switches', () => {
  it('toggles grain', () => {
    preferences.toggleGrain()
    expect(preferences.grain).toBe(false)
    preferences.toggleGrain()
    expect(preferences.grain).toBe(true)
  })

  it('toggles motion', () => {
    preferences.toggleMotion()
    expect(preferences.motion).toBe(false)
  })
})

describe('leader timeout', () => {
  it('steps up and down', () => {
    const start = preferences.leaderTimeoutMs
    preferences.nudgeLeaderTimeout(1)
    expect(preferences.leaderTimeoutMs).toBe(start + LEADER_TIMEOUT_RANGE.step)
    preferences.nudgeLeaderTimeout(-1)
    expect(preferences.leaderTimeoutMs).toBe(start)
  })

  it('stops at a value the chord is still usable at', () => {
    for (let i = 0; i < 50; i += 1) preferences.nudgeLeaderTimeout(-1)
    expect(preferences.leaderTimeoutMs).toBe(LEADER_TIMEOUT_RANGE.min)

    for (let i = 0; i < 100; i += 1) preferences.nudgeLeaderTimeout(1)
    expect(preferences.leaderTimeoutMs).toBe(LEADER_TIMEOUT_RANGE.max)
  })

  it('reads as seconds, which is what the row shows', () => {
    preferences.apply({ ...DEFAULT_PREFERENCES, leaderTimeoutMs: 2600 })
    expect(preferences.leaderTimeoutLabel).toBe('2.6s')
  })
})

describe('reasoning', () => {
  it('cycles through the four levels', () => {
    preferences.reasoning = 'off'
    preferences.cycleReasoning(1)
    expect(preferences.reasoning).toBe('low')
    preferences.cycleReasoning(1)
    expect(preferences.reasoning).toBe('medium')
  })

  it('stops at each end rather than wrapping', () => {
    // Wrapping from high straight to off would be a large, silent change to
    // what the next turn costs.
    preferences.reasoning = 'high'
    preferences.cycleReasoning(1)
    expect(preferences.reasoning).toBe('high')

    preferences.reasoning = 'off'
    preferences.cycleReasoning(-1)
    expect(preferences.reasoning).toBe('off')
  })
})

describe('what gets stored', () => {
  it('carries exactly the three settings the catalog keeps', () => {
    preferences.toggleGrain()
    preferences.reasoning = 'low'

    expect(preferences.stored).toEqual({
      grain: false,
      motion: true,
      leaderTimeoutMs: DEFAULT_PREFERENCES.leaderTimeoutMs,
    })
  })

  it('round-trips through apply', () => {
    const saved = { grain: false, motion: false, leaderTimeoutMs: 1800 }
    preferences.apply(saved)

    expect(preferences.stored).toEqual(saved)
  })
})
