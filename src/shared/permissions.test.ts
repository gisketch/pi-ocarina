import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERMISSION,
  isPermissionLevel,
  nextLevel,
  resolveLevel,
  type PermissionLevel,
} from './permissions'

describe('which level is in force', () => {
  it('takes the thread when it has one', () => {
    expect(resolveLevel('full', 'ask', 'auto')).toBe('full')
  })

  it('takes the workspace when the thread has none', () => {
    expect(resolveLevel(undefined, 'ask', 'auto')).toBe('ask')
  })

  it('takes the global default when neither has one', () => {
    expect(resolveLevel(undefined, undefined, 'auto')).toBe('auto')
  })

  it('treats absent as inherit, never as ask', () => {
    // The trap this exists to avoid: an absent workspace level meaning the
    // strictest thing, so the global default a reader set never applied.
    expect(resolveLevel(undefined, undefined, 'full')).toBe('full')
  })
})

describe('the default', () => {
  it('is auto', () => {
    expect(DEFAULT_PERMISSION).toBe('auto')
  })
})

describe('reading a stored level', () => {
  it('accepts the three', () => {
    for (const level of ['ask', 'auto', 'full']) expect(isPermissionLevel(level)).toBe(true)
  })

  it('rejects anything else, so a corrupt file cannot reach full', () => {
    for (const value of ['FULL', 'bypass', '', null, undefined, 1, {}]) {
      expect(isPermissionLevel(value)).toBe(false)
    }
  })
})

describe('cycling the workspace row', () => {
  it('goes inherit, ask, auto, full, and back to inherit', () => {
    const seen: (PermissionLevel | undefined)[] = []
    let level: PermissionLevel | undefined = undefined
    for (let i = 0; i < 4; i += 1) {
      level = nextLevel(level)
      seen.push(level)
    }
    expect(seen).toEqual(['ask', 'auto', 'full', undefined])
  })
})
