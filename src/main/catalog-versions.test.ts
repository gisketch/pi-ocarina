/** Reading catalogs written by older builds.
 *
 *  Split from `catalog.test.ts` so the migration ladder has one file of its
 *  own: it grows by a block every time a field is added, and it is the part
 *  someone reads when a user's stored catalog stops loading. */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG, DEFAULT_PREFERENCES, parseCatalog, readCatalog } from './catalog'

const workspace = {
  id: 'w1',
  path: '/repos/pi-core',
  name: 'pi-core',
  note: 'D',
  hue: 152,
}

let dir: string
async function tempFile(name = 'catalog.json'): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'piocarina-'))
  return join(dir, name)
}

afterEach(() => {
  dir = ''
})

describe('catalog versions', () => {
  it('upgrades a version 2 catalog, keeping pins and approvals', () => {
    const { state, warning } = parseCatalog(
      JSON.stringify({
        version: 2,
        workspaces: [workspace],
        workspaceIndex: 1,
        focus: [0, 1],
        approvals: { w1: ['bash:pnpm'] },
      }),
    )

    expect(warning).toBeUndefined()
    expect(state.version).toBe(7)
    expect(state.workspaces).toEqual([workspace])
    expect(state.approvals).toEqual({ w1: ['bash:pnpm'] })
    expect(state.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('upgrades a version 3 catalog, keeping pins, approvals and preferences', () => {
    const { state, warning } = parseCatalog(
      JSON.stringify({
        version: 3,
        workspaces: [workspace],
        workspaceIndex: 1,
        focus: [0, 1],
        approvals: { w1: ['bash:pnpm'] },
        preferences: { grain: false, motion: true, leaderTimeoutMs: 1200 },
      }),
    )

    expect(warning).toBeUndefined()
    expect(state.version).toBe(7)
    expect(state.workspaces).toEqual([workspace])
    expect(state.approvals).toEqual({ w1: ['bash:pnpm'] })
    expect(state.preferences.leaderTimeoutMs).toBe(1200)
    // Version 3 had no closed threads, so nothing starts hidden.
    expect(state.archived).toEqual({})
  })

  it('reads a stored archived list, dropping entries it cannot read', () => {
    const { state } = parseCatalog(
      JSON.stringify({
        version: 4,
        archived: { w1: ['s1', 7, '', null], w2: 'all', w3: [] },
      }),
    )

    expect(state.archived).toEqual({ w1: ['s1'] })
  })

  it('upgrades a version 4 catalog, keeping pins, approvals and closed threads', () => {
    const { state, warning } = parseCatalog(
      JSON.stringify({
        version: 4,
        workspaces: [workspace],
        workspaceIndex: 0,
        focus: [0],
        approvals: { w1: ['bash:pnpm'] },
        archived: { w1: ['s-old'] },
        preferences: { grain: false, motion: true, leaderTimeoutMs: 1200 },
      }),
    )

    expect(warning).toBeUndefined()
    expect(state.version).toBe(7)
    expect(state.workspaces).toEqual([workspace])
    expect(state.approvals).toEqual({ w1: ['bash:pnpm'] })
    expect(state.archived).toEqual({ w1: ['s-old'] })
    expect(state.preferences.leaderTimeoutMs).toBe(1200)
    // Version 4 never arranged columns, so nothing starts reordered.
    expect(state.order).toEqual({})
  })

  it('reads a stored column order, dropping entries it cannot read', () => {
    const { state } = parseCatalog(
      JSON.stringify({ version: 5, order: { w1: ['s1', 7, '', null], w2: 'all' } }),
    )

    expect(state.order).toEqual({ w1: ['s1'] })
  })

  it('still refuses a version it has never heard of', () => {
    const { state, warning } = parseCatalog('{"version":99}')

    expect(warning).toMatch(/unsupported/)
    expect(state).toEqual(DEFAULT_CATALOG)
  })
})

describe('retired worktrees', () => {
  it('reads them back, dropping what it cannot', () => {
    const { state } = parseCatalog(
      JSON.stringify({ version: 6, retired: { w1: ['fix/gone', '', 3], w2: 'all' } }),
    )

    expect(state.retired).toEqual({ w1: ['fix/gone'] })
  })

  it('upgrades a version 5 catalog, which never stored any', () => {
    const { state, warning } = parseCatalog(
      JSON.stringify({ version: 5, archived: { w1: ['s-old'] } }),
    )

    expect(warning).toBeUndefined()
    expect(state.version).toBe(7)
    expect(state.archived).toEqual({ w1: ['s-old'] })
    expect(state.retired).toEqual({})
  })
})
