import { beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from '../session'
import { roles } from './roles.svelte'

function answers(list: { roles: unknown[]; names: string[] }) {
  // The tests run without an Electron backend, so `wired` is false and the
  // screen would otherwise show the shipped roles instead of talking to main.
  vi.spyOn(session, 'wired', 'get').mockReturnValue(true)
  return vi.spyOn(session, 'invoke').mockImplementation(async (name) => {
    if (name === 'listRoles') return list as never
    return { ok: true } as never
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('the roles the screen edits', () => {
  it('loads what main holds', async () => {
    answers({ roles: [{ id: 'scout', name: 'scout', instructions: 'look', tools: [] }], names: ['zeus'] })
    await roles.load()

    expect(roles.roles.map((role) => role.name)).toEqual(['scout'])
    expect(roles.names).toEqual(['zeus'])
  })

  it('reports a failure rather than showing an empty list as the truth', async () => {
    vi.spyOn(session, 'wired', 'get').mockReturnValue(true)
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('no backend'))
    await roles.load()

    expect(roles.error).toBe('no backend')
    expect(roles.loading).toBe(false)
  })

  it('reloads after a save, so the list is main’s and not a guess', async () => {
    const invoke = answers({ roles: [], names: [] })
    await roles.save({ id: 'a', name: 'scout', instructions: 'look', tools: ['read'] })

    expect(invoke).toHaveBeenCalledWith('saveRole', expect.anything())
    expect(invoke).toHaveBeenCalledWith('listRoles', {})
  })

  it('reloads after a delete too', async () => {
    const invoke = answers({ roles: [], names: [] })
    await roles.remove('a')

    expect(invoke).toHaveBeenCalledWith('deleteRole', { roleId: 'a' })
    expect(invoke).toHaveBeenCalledWith('listRoles', {})
  })
})

describe('the id a new role gets', () => {
  it('is the name, made safe to read in a file', async () => {
    answers({ roles: [], names: [] })
    await roles.load()

    expect(roles.idFor('Code Reviewer')).toBe('code-reviewer')
  })

  it('never collides with one that exists', async () => {
    answers({
      roles: [
        { id: 'scout', name: 'scout', instructions: 'x', tools: [] },
        { id: 'scout-2', name: 'other', instructions: 'x', tools: [] },
      ],
      names: [],
    })
    await roles.load()

    expect(roles.idFor('scout')).toBe('scout-3')
  })

  it('falls back to a word when the name is all punctuation', async () => {
    answers({ roles: [], names: [] })
    await roles.load()

    expect(roles.idFor('!!!')).toBe('role')
  })
})

describe('without a backend, as in the browser harness', () => {
  it('shows the shipped roles rather than an error where four roles belong', async () => {
    await roles.load()

    expect(roles.roles.map((role) => role.name)).toEqual([
      'scout',
      'planner',
      'reviewer',
      'developer',
    ])
    expect(roles.error).toBeNull()
  })

  it('edits the copy in front of it rather than failing', async () => {
    await roles.load()
    await roles.remove('scout')

    expect(roles.roles.map((role) => role.name)).not.toContain('scout')
  })
})
