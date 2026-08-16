import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type CatalogState,
  DEFAULT_CATALOG,
  DEFAULT_PREFERENCES,
  parseCatalog,
  parsePreferences,
  readCatalog,
  writeCatalog,
} from './catalog'

let dir: string
async function tempFile(name = 'catalog.json'): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'piocarina-'))
  return join(dir, name)
}

afterEach(() => {
  dir = ''
})

const workspace = {
  id: 'w1',
  path: '/repos/pi-core',
  name: 'pi-core',
  note: 'D',
  hue: 152,
}

describe('parseCatalog', () => {
  it('accepts a well-formed catalog', () => {
    const { state, warning } = parseCatalog(
      JSON.stringify({ version: 3, workspaces: [workspace], workspaceIndex: 2, focus: [1, 0, 0] }),
    )

    expect(warning).toBeUndefined()
    expect(state).toEqual({
      version: 5,
      workspaces: [workspace],
      workspaceIndex: 2,
      focus: [1, 0, 0],
      approvals: {},
      archived: {},
      order: {},
      preferences: DEFAULT_PREFERENCES,
    })
  })

  it('upgrades a version 1 catalog instead of discarding the position', () => {
    const { state, warning } = parseCatalog('{"version":1,"workspaceIndex":2,"focus":[1,0]}')

    expect(warning).toBeUndefined()
    expect(state).toEqual({
      version: 5,
      workspaces: [],
      workspaceIndex: 2,
      focus: [1, 0],
      approvals: {},
      archived: {},
      order: {},
      preferences: DEFAULT_PREFERENCES,
    })
  })

  it('falls back to defaults on malformed JSON, with a warning', () => {
    const { state, warning } = parseCatalog('{not json')

    expect(state).toEqual(DEFAULT_CATALOG)
    expect(warning).toMatch(/valid JSON/)
  })

  it('rejects a non-object payload', () => {
    expect(parseCatalog('42').warning).toMatch(/not an object/)
    expect(parseCatalog('null').warning).toMatch(/not an object/)
  })

  it('rejects an unknown version rather than guessing', () => {
    expect(parseCatalog('{"version":9}').warning).toMatch(/unsupported catalog version/)
  })

  it('drops nonsense fields instead of failing', () => {
    const { state } = parseCatalog(
      '{"version":2,"workspaceIndex":"two","focus":[0,"x",-3,2.5,4]}',
    )

    expect(state.workspaceIndex).toBe(0)
    expect(state.focus).toEqual([0, 4])
  })

  it('keeps sound workspaces and drops the ones it cannot identify', () => {
    const { state } = parseCatalog(
      JSON.stringify({
        version: 3,
        workspaces: [workspace, { id: 'no-path' }, { path: '/no/id' }, 'nonsense', null],
        workspaceIndex: 0,
        focus: [],
      }),
    )

    expect(state.workspaces).toEqual([workspace])
  })

  it('fills in a workspace missing its cosmetic fields', () => {
    const { state } = parseCatalog(
      JSON.stringify({ version: 3, workspaces: [{ id: 'w', path: '/tmp/x' }] }),
    )

    expect(state.workspaces[0]).toEqual({ id: 'w', path: '/tmp/x', name: '/tmp/x', note: '', hue: 0 })
  })
})

describe('parseCatalog approvals', () => {
  it('keeps well-formed rules', () => {
    const { state } = parseCatalog(
      JSON.stringify({ version: 3, approvals: { w1: ['bash:pnpm', 'write'] } }),
    )

    expect(state.approvals).toEqual({ w1: ['bash:pnpm', 'write'] })
  })

  it('drops anything it cannot read rather than guessing a permission', () => {
    const { state } = parseCatalog(
      JSON.stringify({
        version: 3,
        approvals: { w1: ['bash:pnpm', 7, '', null], w2: 'all', w3: [] },
      }),
    )

    expect(state.approvals).toEqual({ w1: ['bash:pnpm'] })
  })

  it('ignores an approvals field of the wrong shape entirely', () => {
    expect(parseCatalog('{"version":2,"approvals":["w1"]}').state.approvals).toEqual({})
    expect(parseCatalog('{"version":2,"approvals":null}').state.approvals).toEqual({})
  })

  it('does not let a duplicate rule pile up', () => {
    const { state } = parseCatalog(
      JSON.stringify({ version: 3, approvals: { w1: ['write', 'write'] } }),
    )

    expect(state.approvals.w1).toEqual(['write'])
  })
})

describe('readCatalog', () => {
  it('returns defaults without a warning when no catalog exists yet', async () => {
    const file = await tempFile('missing.json')
    const { state, warning } = await readCatalog(file)

    expect(state).toEqual(DEFAULT_CATALOG)
    expect(warning).toBeUndefined()
  })

  it('recovers from a corrupt catalog', async () => {
    const file = await tempFile()
    await writeFile(file, 'GARBAGE', 'utf8')
    const { state, warning } = await readCatalog(file)

    expect(state).toEqual(DEFAULT_CATALOG)
    expect(warning).toBeDefined()
  })
})

describe('writeCatalog', () => {
  it('round-trips state', async () => {
    const file = await tempFile()
    const state: CatalogState = {
      version: 5,
      workspaces: [workspace],
      workspaceIndex: 1,
      focus: [2, 1, 0],
      approvals: { w1: ['bash:pnpm', 'write'] },
      archived: { w1: ['s-old'] },
      order: { w1: ['s1', 's-old'] },
      preferences: { grain: false, motion: false, leaderTimeoutMs: 1800 },
    }

    await writeCatalog(file, state)

    expect((await readCatalog(file)).state).toEqual(state)
  })

  it('writes readable JSON', async () => {
    const file = await tempFile()
    await writeCatalog(file, { ...DEFAULT_CATALOG })

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(DEFAULT_CATALOG)
  })

  it('replaces an existing catalog', async () => {
    const file = await tempFile()
    await writeCatalog(file, { ...DEFAULT_CATALOG, workspaceIndex: 0, focus: [0] })
    await writeCatalog(file, { ...DEFAULT_CATALOG, workspaceIndex: 2, focus: [1, 1, 1] })

    expect((await readCatalog(file)).state.workspaceIndex).toBe(2)
  })
})

describe('parsePreferences', () => {
  it('takes the defaults when there is nothing stored', () => {
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
  })

  it('reads what the user set', () => {
    expect(parsePreferences({ grain: false, motion: false, leaderTimeoutMs: 1200 })).toEqual({
      grain: false,
      motion: false,
      leaderTimeoutMs: 1200,
    })
  })

  it('falls back per field, so one bad value costs only that setting', () => {
    const prefs = parsePreferences({ grain: false, motion: 'yes', leaderTimeoutMs: 'soon' })

    expect(prefs.grain).toBe(false)
    expect(prefs.motion).toBe(DEFAULT_PREFERENCES.motion)
    expect(prefs.leaderTimeoutMs).toBe(DEFAULT_PREFERENCES.leaderTimeoutMs)
  })

  it('clamps a timeout that would make the leader chord unusable', () => {
    // Zero would end the chord before a key could follow it; an hour would
    // leave the shell stuck in LEADER with no way out but escape.
    expect(parsePreferences({ leaderTimeoutMs: 0 }).leaderTimeoutMs).toBe(800)
    expect(parsePreferences({ leaderTimeoutMs: 3_600_000 }).leaderTimeoutMs).toBe(8000)
  })
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
    expect(state.version).toBe(5)
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
    expect(state.version).toBe(5)
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

  it('still refuses a version it has never heard of', () => {
    const { state, warning } = parseCatalog('{"version":99}')

    expect(warning).toMatch(/unsupported/)
    expect(state).toEqual(DEFAULT_CATALOG)
  })
})
