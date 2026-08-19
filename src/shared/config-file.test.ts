import { describe, expect, it } from 'vitest'
import { FIXED_KEYS, HOOK_POINTS, parseConfig } from './config-file'

const of = (value: unknown) => parseConfig(JSON.stringify(value))

describe('a file that cannot be read at all', () => {
  it('reports one problem rather than failing to start', () => {
    const { config, problems } = parseConfig('{not json')
    expect(config).toEqual({ keys: [], hooks: [], rules: [], titles: {} })
    expect(problems).toHaveLength(1)
    expect(problems[0].where).toBe('file')
  })

  it('refuses a top-level array or scalar', () => {
    expect(parseConfig('[]').problems[0].message).toContain('object')
    expect(parseConfig('4').problems[0].message).toContain('object')
  })

  it('reads an empty object as nothing configured', () => {
    const { config, problems } = of({})
    expect(problems).toEqual([])
    expect(config.keys).toEqual([])
  })
})

describe('keys', () => {
  it('reads a well-formed binding', () => {
    const { config, problems } = of({
      keys: [{ mode: 'OCARINA', key: 'x', action: 'nextThread' }],
    })
    expect(problems).toEqual([])
    expect(config.keys).toEqual([{ mode: 'OCARINA', key: 'x', action: 'nextThread' }])
  })

  it('reads the old NORMAL as OCARINA, so pre-rename configs keep working', () => {
    const { config, problems } = of({
      keys: [{ mode: 'NORMAL', key: 'x', action: 'nextThread' }],
    })
    expect(problems).toEqual([])
    expect(config.keys[0].mode).toBe('OCARINA')
  })

  it('drops one bad binding and keeps its neighbours', () => {
    const { config, problems } = of({
      keys: [
        { mode: 'NORMAL', key: 'x', action: 'a' },
        { mode: 'SIDEWAYS', key: 'y', action: 'b' },
        { mode: 'READ', key: 'z', action: 'c' },
      ],
    })
    expect(config.keys.map((one) => one.key)).toEqual(['x', 'z'])
    expect(problems).toHaveLength(1)
    expect(problems[0].where).toBe('keys[1]')
  })

  it('protects Escape and only Escape', () => {
    // The 2026-08-19 rebindable-keymaps spec: one fixed exit is enough to
    // stay recoverable, and every other key — mode entries included — may
    // move. An earlier list also fixed `i d j k t ␣`, which left a non-QWERTY
    // reader unable to move the keys they hit most.
    expect([...FIXED_KEYS]).toEqual(['Escape'])
  })

  it('refuses to rebind a key that leaves a mode', () => {
    // Recoverability: an app you cannot leave is fixed by editing a file you
    // cannot reach, because the app is holding the keyboard.
    for (const key of FIXED_KEYS) {
      const { config, problems } = of({ keys: [{ mode: 'NORMAL', key, action: 'a' }] })
      expect(config.keys).toEqual([])
      expect(problems[0].message).toContain('cannot be rebound')
    }
  })

  it('drops both halves of a collision rather than picking a winner', () => {
    const { config, problems } = of({
      keys: [
        { mode: 'NORMAL', key: 'x', action: 'first' },
        { mode: 'NORMAL', key: 'x', action: 'second' },
        { mode: 'READ', key: 'x', action: 'other mode, no collision' },
      ],
    })
    expect(config.keys.map((one) => one.mode)).toEqual(['READ'])
    expect(problems).toHaveLength(2)
  })

  it('reports a missing key or action by name', () => {
    const { problems } = of({
      keys: [{ mode: 'NORMAL', action: 'a' }, { mode: 'NORMAL', key: 'x' }],
    })
    expect(problems.map((one) => one.message)).toEqual(['no key', 'no action'])
  })

  it('reads the mode case-insensitively', () => {
    expect(of({ keys: [{ mode: 'ocarina', key: 'x', action: 'a' }] }).config.keys[0].mode).toBe(
      'OCARINA',
    )
  })

  it('reads a non-list as a problem, not a crash', () => {
    expect(of({ keys: 'j' }).problems[0].where).toBe('keys')
  })
})

describe('hooks', () => {
  it('reads the three points and nothing else', () => {
    for (const on of HOOK_POINTS) {
      expect(of({ hooks: [{ on, command: 'x' }] }).config.hooks).toHaveLength(1)
    }
    expect(of({ hooks: [{ on: 'tool.after', command: 'x' }] }).problems[0].message).toContain(
      'unknown point',
    )
  })

  it('keeps a timeout only when it is a usable number', () => {
    expect(of({ hooks: [{ on: 'turn.end', command: 'x', timeoutMs: 500 }] }).config.hooks[0]).toEqual(
      { on: 'turn.end', command: 'x', timeoutMs: 500 },
    )
    expect(of({ hooks: [{ on: 'turn.end', command: 'x', timeoutMs: -1 }] }).config.hooks[0]).toEqual({
      on: 'turn.end',
      command: 'x',
    })
    expect(
      of({ hooks: [{ on: 'turn.end', command: 'x', timeoutMs: 'soon' }] }).config.hooks[0],
    ).toEqual({ on: 'turn.end', command: 'x' })
  })

  it('refuses a hook with no command', () => {
    expect(of({ hooks: [{ on: 'turn.end', command: '  ' }] }).problems[0].message).toBe('no command')
  })
})

describe('rules', () => {
  it('reads allow and deny, with an optional workspace', () => {
    const { config, problems } = of({
      rules: [
        { effect: 'allow', tool: 'bash', match: 'pnpm test', workspace: '/repo' },
        { effect: 'deny', tool: '*', match: 'rm ' },
      ],
    })
    expect(problems).toEqual([])
    expect(config.rules[0].workspace).toBe('/repo')
    expect(config.rules[1].workspace).toBeUndefined()
  })

  it('refuses an effect that is neither', () => {
    expect(of({ rules: [{ effect: 'maybe', tool: 'bash', match: 'x' }] }).problems[0].message).toContain(
      'allow or deny',
    )
  })

  it('refuses a rule that matches nothing in particular', () => {
    // A rule with no subject covers every command, which is what `full access`
    // is for and is not something to reach by leaving a field out.
    expect(of({ rules: [{ effect: 'allow', tool: 'bash', match: '' }] }).problems[0].message).toContain(
      'not a rule',
    )
  })
})

describe('titles', () => {
  it('is empty when the file says nothing, which means on and automatic', () => {
    expect(of({}).config.titles).toEqual({})
  })

  it('reads a pinned model and an off switch', () => {
    const { config, problems } = of({
      titles: { model: 'anthropic/claude-haiku-4-5', enabled: false },
    })
    expect(problems).toEqual([])
    expect(config.titles).toEqual({ model: 'anthropic/claude-haiku-4-5', enabled: false })
  })

  it('refuses a model not spelt provider/id, and keeps the rest', () => {
    const { config, problems } = of({ titles: { model: 'haiku', enabled: false } })
    expect(problems[0].where).toBe('titles.model')
    expect(config.titles).toEqual({ enabled: false })
  })

  it('refuses an enabled that is not a boolean', () => {
    expect(of({ titles: { enabled: 'no' } }).problems[0].where).toBe('titles.enabled')
  })
})
