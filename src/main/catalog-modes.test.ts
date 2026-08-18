import { describe, expect, it } from 'vitest'
import { defaultCatalog, type CatalogState } from './catalog'
import { deleteMode, modeFor, saveMode, setDefaultMode } from './catalog-modes'

const mode = (id: string) => ({ id, name: id, instructions: `write ${id}` })

function state(): CatalogState {
  const fresh = defaultCatalog()
  fresh.modes = [mode('terse'), mode('plain')]
  return fresh
}

describe('storing modes', () => {
  it('adds one, then replaces it by id', () => {
    const catalog = state()
    saveMode(catalog, mode('loud'))
    expect(catalog.modes).toHaveLength(3)

    saveMode(catalog, { id: 'loud', name: 'louder', instructions: 'shout' })
    expect(catalog.modes).toHaveLength(3)
    expect(catalog.modes.find((one) => one.id === 'loud')?.name).toBe('louder')
  })

  it('clears the default when the mode it points at is deleted', () => {
    const catalog = state()
    setDefaultMode(catalog, 'terse')
    deleteMode(catalog, 'terse')

    // A dangling default resolves to no voice anyway, but it would show in
    // settings as a default nobody can see and nobody can clear.
    expect(catalog.preferences.defaultMode).toBeUndefined()
    expect(modeFor(catalog)).toBeUndefined()
  })

  it('leaves a default alone when a different mode is deleted', () => {
    const catalog = state()
    setDefaultMode(catalog, 'terse')
    deleteMode(catalog, 'plain')

    expect(catalog.preferences.defaultMode).toBe('terse')
  })

  it('removes the field rather than storing undefined', () => {
    const catalog = state()
    setDefaultMode(catalog, 'terse')
    setDefaultMode(catalog, undefined)

    expect('defaultMode' in catalog.preferences).toBe(false)
  })
})
