import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultCatalog, readCatalog } from './catalog'
import { CatalogStore } from './catalog-store'

async function store(): Promise<{ store: CatalogStore; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-store-'))
  const file = join(dir, 'catalog.json')
  const created = new CatalogStore(file)
  await created.load()
  return { store: created, file }
}

describe('CatalogStore', () => {
  it('pins a folder with a derived name, note and hue', async () => {
    const { store: catalog } = await store()

    const workspace = catalog.pin('/repos/pi-core')

    expect(workspace.name).toBe('pi-core')
    expect(workspace.note).not.toBe('')
    expect(workspace.hue).toBeGreaterThan(0)
  })

  it('gives the same folder the same voice every time', async () => {
    const first = (await store()).store.pin('/repos/pi-core')
    const second = (await store()).store.pin('/repos/pi-core')

    expect(second.note).toBe(first.note)
    expect(second.hue).toBe(first.hue)
  })

  it('pinning the same folder twice does not duplicate it', async () => {
    const { store: catalog } = await store()

    const first = catalog.pin('/repos/pi-core')
    const again = catalog.pin('/repos/pi-core')

    expect(again.id).toBe(first.id)
    expect(catalog.snapshot().workspaces).toHaveLength(1)
  })

  it('persists a pin to disk', async () => {
    const { store: catalog, file } = await store()

    catalog.pin('/repos/pi-core')
    await catalog.flush()

    expect((await readCatalog(file)).state.workspaces).toHaveLength(1)
  })

  it('unpinning also forgets that workspace’s remembered position', async () => {
    const { store: catalog } = await store()
    const first = catalog.pin('/repos/a')
    catalog.pin('/repos/b')
    catalog.setPosition(1, [3, 7])

    catalog.unpin(first.id)

    expect(catalog.snapshot().workspaces.map((w) => w.path)).toEqual(['/repos/b'])
    expect(catalog.snapshot().focus).toEqual([7])
  })

  it('pulls the selected workspace back in range when the last one is unpinned', async () => {
    const { store: catalog } = await store()
    catalog.pin('/repos/a')
    const second = catalog.pin('/repos/b')
    catalog.setPosition(1, [0, 0])

    catalog.unpin(second.id)

    expect(catalog.snapshot().workspaceIndex).toBe(0)
  })

  it('saving a position never erases pinned workspaces', async () => {
    const { store: catalog, file } = await store()
    catalog.pin('/repos/pi-core')

    catalog.setPosition(0, [2])
    await catalog.flush()

    const { state } = await readCatalog(file)
    expect(state.workspaces).toHaveLength(1)
    expect(state.focus).toEqual([2])
  })

  it('survives a corrupt file by starting empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-store-'))
    const file = join(dir, 'catalog.json')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, 'not json', 'utf8')

    const catalog = new CatalogStore(file)
    const { warning } = await catalog.load()

    expect(warning).toBeDefined()
    expect(catalog.snapshot().workspaces).toEqual([])
  })

  it('reports an unknown workspace rather than returning a wrong path', async () => {
    const { store: catalog } = await store()

    expect(catalog.workspace('nope')).toBeUndefined()
  })
})

describe('closed threads', () => {
  it('remembers a closed thread across a relaunch', async () => {
    const { store: catalog, file } = await store()
    const workspace = catalog.pin('/repos/pi-core')

    catalog.archive(workspace.id, 's1')
    await catalog.flush()

    expect((await readCatalog(file)).state.archived).toEqual({ [workspace.id]: ['s1'] })
  })

  it('forgets it again when the thread is reopened', async () => {
    const { store: catalog, file } = await store()
    const workspace = catalog.pin('/repos/pi-core')
    catalog.archive(workspace.id, 's1')
    catalog.archive(workspace.id, 's2')

    catalog.unarchive(workspace.id, 's1')
    await catalog.flush()

    expect((await readCatalog(file)).state.archived).toEqual({ [workspace.id]: ['s2'] })
  })

  it('drops the workspace entry entirely when nothing is left closed', async () => {
    const { store: catalog } = await store()
    const workspace = catalog.pin('/repos/pi-core')
    catalog.archive(workspace.id, 's1')

    catalog.unarchive(workspace.id, 's1')

    expect(catalog.snapshot().archived).toEqual({})
  })

  it('does not let the same thread pile up', async () => {
    const { store: catalog } = await store()
    const workspace = catalog.pin('/repos/pi-core')

    catalog.archive(workspace.id, 's1')
    catalog.archive(workspace.id, 's1')

    expect(catalog.listArchived(workspace.id)).toEqual(['s1'])
  })

  it('forgets a workspace’s closed threads when it is unpinned', async () => {
    const { store: catalog } = await store()
    const workspace = catalog.pin('/repos/pi-core')
    catalog.archive(workspace.id, 's1')

    catalog.unpin(workspace.id)

    // A folder that is no longer pinned has no strip to hide threads from.
    expect(catalog.snapshot().archived).toEqual({})
  })

  it('reports nothing closed for a workspace that never closed one', async () => {
    const { store: catalog } = await store()

    expect(catalog.listArchived('never-seen')).toEqual([])
  })
})

describe('answering before anything has asked it to load', () => {
  it('reports nothing pinned until the file has been read', async () => {
    // The whole reason main must load the store before it serves a single
    // command: an unloaded store honestly reports its empty defaults, and a
    // returning user is told nothing is pinned.
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-store-'))
    const file = join(dir, 'catalog.json')
    const seeded = new CatalogStore(file)
    await seeded.load()
    seeded.pin('/repos/pi-core')
    await seeded.flush()

    const fresh = new CatalogStore(file)
    expect(fresh.snapshot().workspaces).toEqual([])

    await fresh.load()
    expect(fresh.snapshot().workspaces).toHaveLength(1)
  })
})

describe('the roles a profile starts with', () => {
  async function store(): Promise<{ file: string; catalog: CatalogStore }> {
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-roles-'))
    const file = join(dir, 'catalog.json')
    const catalog = new CatalogStore(file)
    await catalog.load()
    return { file, catalog }
  }

  it('seeds four roles and a pool on a fresh profile', async () => {
    const { catalog } = await store()
    expect(catalog.roles().map((role) => role.name)).toEqual([
      'scout',
      'planner',
      'reviewer',
      'developer',
    ])
    expect(catalog.namePool().length).toBeGreaterThan(20)
  })

  it('keeps an edit rather than putting the shipped role back', async () => {
    const { file, catalog } = await store()
    const scout = catalog.role('scout')
    catalog.saveRole({ ...scout!, instructions: 'mine now' })
    await catalog.flush()

    const reopened = new CatalogStore(file)
    await reopened.load()
    expect(reopened.role('scout')?.instructions).toBe('mine now')
  })

  it('leaves a deleted role deleted', async () => {
    const { file, catalog } = await store()
    for (const role of catalog.roles()) catalog.deleteRole(role.id)
    await catalog.flush()

    const reopened = new CatalogStore(file)
    await reopened.load()
    expect(reopened.roles()).toEqual([])
  })

  it('seeds a catalog written before roles existed, once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-roles-v6-'))
    const file = join(dir, 'catalog.json')
    await writeFile(file, JSON.stringify({ version: 6, workspaces: [] }), 'utf8')

    const catalog = new CatalogStore(file)
    await catalog.load()
    expect(catalog.roles()).toHaveLength(4)

    catalog.deleteRole(catalog.roles()[0].id)
    await catalog.flush()

    const reopened = new CatalogStore(file)
    await reopened.load()
    expect(reopened.roles()).toHaveLength(3)
  })

  it('replaces a role by id rather than adding a second', async () => {
    const { catalog } = await store()
    const scout = catalog.role('scout')!
    catalog.saveRole({ ...scout, name: 'recon' })
    expect(catalog.roles()).toHaveLength(4)
    expect(catalog.role('scout')).toBeUndefined()
    expect(catalog.role('recon')).toBeDefined()
  })

  it('hands out copies, so a caller cannot edit the store by holding a role', async () => {
    const { catalog } = await store()
    const roles = catalog.roles()
    roles[0].tools.push('write')
    expect(catalog.roles()[0].tools).not.toContain('write')
  })
})

describe('two roles cannot share a name', () => {
  it('refuses the second, rather than saving one that vanishes on restart', async () => {
    // `parseRoles` keeps the first of two roles sharing a name, so accepting
    // the write would show a saved role that is gone on the next launch.
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-dupe-'))
    const catalog = new CatalogStore(join(dir, 'catalog.json'))
    await catalog.load()

    const refused = catalog.saveRole({
      id: 'mine',
      name: 'scout',
      instructions: 'also a scout',
      tools: [],
    })

    expect(refused.ok).toBe(false)
    expect(refused.reason).toContain('scout')
    expect(catalog.roles().filter((role) => role.name === 'scout')).toHaveLength(1)
  })

  it('still lets a role keep its own name when it is edited', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-dupe-'))
    const catalog = new CatalogStore(join(dir, 'catalog.json'))
    await catalog.load()

    const scout = catalog.role('scout')!
    expect(catalog.saveRole({ ...scout, instructions: 'changed' }).ok).toBe(true)
    expect(catalog.role('scout')?.instructions).toBe('changed')
  })
})

describe('seeding the shipped voice', () => {
  it('reaches a catalog that was already seeded for roles', async () => {
    // Every install that predates modes has `seeded: true`. A shared flag would
    // mean none of them ever saw the shipped voice, which is the one case
    // seeding exists for.
    const dir = await mkdtemp(join(tmpdir(), 'piocarina-store-'))
    const file = join(dir, 'catalog.json')
    await writeFile(file, JSON.stringify({ ...defaultCatalog(), seeded: true }), 'utf8')

    const catalog = new CatalogStore(file)
    await catalog.load()
    catalog.seedOnce()

    expect(catalog.modes().map((one) => one.id)).toEqual(['terse'])
    // Roles stay as the reader left them: they were seeded once already.
    expect(catalog.roles()).toEqual([])
  })

  it('does not put a deleted voice back', async () => {
    const { store: catalog } = await store()
    catalog.seedOnce()
    catalog.deleteMode('terse')
    catalog.seedOnce()

    expect(catalog.modes()).toEqual([])
  })
})
