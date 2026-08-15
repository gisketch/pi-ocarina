import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type CatalogState, DEFAULT_CATALOG, parseCatalog, readCatalog, writeCatalog } from './catalog'

let dir: string
async function tempFile(name = 'catalog.json'): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'piocarina-'))
  return join(dir, name)
}

afterEach(() => {
  dir = ''
})

describe('parseCatalog', () => {
  it('accepts a well-formed catalog', () => {
    const { state, warning } = parseCatalog('{"version":1,"workspaceIndex":2,"focus":[1,0,0]}')
    expect(warning).toBeUndefined()
    expect(state).toEqual({ version: 1, workspaceIndex: 2, focus: [1, 0, 0] })
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
      '{"version":1,"workspaceIndex":"two","focus":[0,"x",-3,2.5,4]}',
    )
    expect(state.workspaceIndex).toBe(0)
    expect(state.focus).toEqual([0, 4])
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
    const state: CatalogState = { version: 1, workspaceIndex: 1, focus: [2, 1, 0] }
    await writeCatalog(file, { ...state })
    expect((await readCatalog(file)).state).toEqual(state)
  })

  it('writes readable JSON', async () => {
    const file = await tempFile()
    await writeCatalog(file, { version: 1, workspaceIndex: 0, focus: [] })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      version: 1,
      workspaceIndex: 0,
      focus: [],
    })
  })

  it('replaces an existing catalog', async () => {
    const file = await tempFile()
    await writeCatalog(file, { version: 1, workspaceIndex: 0, focus: [0] })
    await writeCatalog(file, { version: 1, workspaceIndex: 2, focus: [1, 1, 1] })
    expect((await readCatalog(file)).state.workspaceIndex).toBe(2)
  })
})
