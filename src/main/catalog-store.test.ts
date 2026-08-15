import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCatalog } from './catalog'
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
