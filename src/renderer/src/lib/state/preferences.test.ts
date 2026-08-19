import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, LEADER_TIMEOUT_RANGE } from '../../../../shared/preferences'
import { REASONING_ORDER } from '../../../../shared/vocabulary'
import { preferences } from './preferences.svelte'

beforeEach(() => {
  preferences.apply(DEFAULT_PREFERENCES)
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


describe('what gets stored', () => {
  it('carries exactly the settings the catalog keeps', () => {
    preferences.toggleGrain()

    expect(preferences.stored).toEqual({
      grain: false,
      motion: true,
      leaderTimeoutMs: DEFAULT_PREFERENCES.leaderTimeoutMs,
      defaultPermission: DEFAULT_PREFERENCES.defaultPermission,
      showReasoning: true,
      bufferRelativeNumbers: true,
    })
  })

  it('round-trips through apply', () => {
    const saved = {
      grain: false,
      motion: false,
      leaderTimeoutMs: 1800,
      defaultPermission: 'ask' as const,
      showReasoning: false,
      bufferRelativeNumbers: false,
    }
    preferences.apply(saved)

    expect(preferences.stored).toEqual(saved)
  })
})

describe('defaults for a new thread', () => {
  it('says pi chooses until the reader picks one', () => {
    expect(preferences.defaultModelLabel).toBe("pi's choice")
    expect(preferences.defaultReasoningLabel).toBe('model default')
  })

  it('records a picked model, and its reasoning level with it', () => {
    preferences.setDefaultModel({ provider: 'anthropic', id: 'claude-opus-5' }, 'high')

    expect(preferences.defaultModel).toEqual({ provider: 'anthropic', id: 'claude-opus-5' })
    expect(preferences.defaultReasoning).toBe('high')
    expect(preferences.stored.defaultModel).toEqual({
      provider: 'anthropic',
      id: 'claude-opus-5',
    })
  })

  it('stores nothing for a model that cannot reason', () => {
    preferences.setDefaultModel({ provider: 'x', id: 'y' }, null)
    expect(preferences.defaultReasoning).toBeUndefined()
  })

  it('walks the reasoning levels, and off the end back to the model default', () => {
    preferences.setDefaultModel({ provider: 'x', id: 'y' }, null)
    preferences.nudgeDefaultReasoning(1)
    expect(preferences.defaultReasoning).toBe(REASONING_ORDER[0])

    preferences.nudgeDefaultReasoning(-1)
    expect(preferences.defaultReasoning).toBeUndefined()
    expect(preferences.defaultReasoningLabel).toBe('model default')
  })
})
