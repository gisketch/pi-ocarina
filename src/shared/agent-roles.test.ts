import { describe, expect, it } from 'vitest'
import { DEFAULT_NAME_POOL, DEFAULT_ROLES, parseNamePool, parseRoles } from './agent-roles'
import { READ_ONLY_TOOLS } from './vocabulary'

describe('the roles that ship', () => {
  it('names four, all distinct', () => {
    const names = DEFAULT_ROLES.map((role) => role.name)
    expect(names).toEqual(['scout', 'planner', 'reviewer', 'developer'])
    expect(new Set(names).size).toBe(4)
  })

  it('lets only the developer write', () => {
    for (const role of DEFAULT_ROLES) {
      const writes = role.tools.some((tool) => tool === 'write' || tool === 'edit')
      expect(writes).toBe(role.name === 'developer')
    }
  })

  it('gives the planner nothing beyond reading', () => {
    const planner = DEFAULT_ROLES.find((role) => role.name === 'planner')
    expect(planner?.tools).toEqual([...READ_ONLY_TOOLS])
  })

  it('draws from a pool larger than any plausible cap', () => {
    expect(DEFAULT_NAME_POOL.length).toBeGreaterThan(20)
    expect(new Set(DEFAULT_NAME_POOL).size).toBe(DEFAULT_NAME_POOL.length)
  })
})

describe('reading roles back off disk', () => {
  it('keeps a whole role', () => {
    const roles = parseRoles([
      { id: 'a', name: 'scout', instructions: 'look', tools: ['read'], model: 'x/y' },
    ])
    expect(roles).toEqual([
      { id: 'a', name: 'scout', instructions: 'look', tools: ['read'], model: 'x/y' },
    ])
  })

  it('drops a role with no instructions, because a role is only instructions', () => {
    expect(parseRoles([{ id: 'a', name: 'scout', tools: ['read'] }])).toEqual([])
  })

  it('drops a role with no name, since a spawn names one', () => {
    expect(parseRoles([{ id: 'a', instructions: 'look' }])).toEqual([])
  })

  it('keeps a role with no tools rather than guessing a ceiling for it', () => {
    const roles = parseRoles([{ id: 'a', name: 'mute', instructions: 'think' }])
    expect(roles).toEqual([{ id: 'a', name: 'mute', instructions: 'think', tools: [] }])
  })

  it('keeps the first of two roles sharing a name', () => {
    const roles = parseRoles([
      { id: 'a', name: 'scout', instructions: 'first' },
      { id: 'b', name: 'scout', instructions: 'second' },
    ])
    expect(roles.map((role) => role.instructions)).toEqual(['first'])
  })

  it('survives anything that is not a list', () => {
    expect(parseRoles(undefined)).toEqual([])
    expect(parseRoles('scout')).toEqual([])
    expect(parseRoles([null, 7, 'x'])).toEqual([])
  })
})

describe('reading the name pool back', () => {
  it('drops duplicates and blanks', () => {
    expect(parseNamePool(['zeus', 'zeus', '', 'hera'])).toEqual(['zeus', 'hera'])
  })

  it('keeps an emptied pool empty, because clearing it was deliberate', () => {
    expect(parseNamePool([])).toEqual([])
  })
})
