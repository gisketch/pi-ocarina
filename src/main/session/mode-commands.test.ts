import { describe, expect, it } from 'vitest'
import { MODE_BOUNDARY, type ChatMode } from '../../shared/chat-modes'
import type { CatalogStore } from '../catalog-store'
import { handleModes, ModeControl } from './mode-commands'

const MODES: ChatMode[] = [
  { id: 'terse', name: 'terse', instructions: 'be brief' },
  { id: 'plain', name: 'plain', instructions: 'be plain' },
]

/** Enough of the store for the control to resolve against. */
function fakeCatalog(defaultMode?: string) {
  const state = { modes: [...MODES], defaultMode, deleted: [] as string[] }
  const catalog = {
    modes: () => [...state.modes],
    modeFor: (threadMode?: string) => {
      const wanted = threadMode ?? state.defaultMode
      return state.modes.find((one) => one.id === wanted)
    },
    setDefaultMode: (modeId?: string) => {
      state.defaultMode = modeId
    },
    saveMode: (mode: ChatMode) => {
      state.modes = [...state.modes.filter((one) => one.id !== mode.id), mode]
      return { mode }
    },
    deleteMode: (modeId: string) => {
      state.deleted.push(modeId)
      state.modes = state.modes.filter((one) => one.id !== modeId)
    },
  } as unknown as CatalogStore
  return { catalog, state }
}

describe('what a thread’s system prompt carries', () => {
  it('is the default’s prose and the boundary', () => {
    const { catalog } = fakeCatalog('terse')
    expect(new ModeControl(catalog).promptFor('t1')).toEqual(['be brief', MODE_BOUNDARY])
  })

  it('is nothing when no voice is set anywhere', () => {
    const { catalog } = fakeCatalog(undefined)
    expect(new ModeControl(catalog).promptFor('t1')).toEqual([])
  })

  it('follows the thread’s own choice over the default', () => {
    const { catalog } = fakeCatalog('terse')
    const control = new ModeControl(catalog)
    control.set('t1', 'plain')

    expect(control.promptFor('t1')).toEqual(['be plain', MODE_BOUNDARY])
    // The neighbour is untouched.
    expect(control.promptFor('t2')).toEqual(['be brief', MODE_BOUNDARY])
  })

  it('returns a thread to the default when its override is cleared', () => {
    const { catalog } = fakeCatalog('terse')
    const control = new ModeControl(catalog)
    control.set('t1', 'plain')
    control.set('t1', undefined)

    expect(control.overridden('t1')).toBe(false)
    expect(control.promptFor('t1')).toEqual(['be brief', MODE_BOUNDARY])
  })

  it('lets a thread be silent while the default speaks', () => {
    const { catalog } = fakeCatalog('terse')
    const control = new ModeControl(catalog)
    control.set('t1', '')

    expect(control.promptFor('t1')).toEqual([])
    expect(control.overridden('t1')).toBe(true)
    expect(control.promptFor('t2')).toEqual(['be brief', MODE_BOUNDARY])
  })

  it('forgets a closed thread, so a reused id inherits nothing', () => {
    const { catalog } = fakeCatalog(undefined)
    const control = new ModeControl(catalog)
    control.set('t1', 'plain')
    control.forget('t1')

    expect(control.promptFor('t1')).toEqual([])
  })
})

describe('the commands behind the picker', () => {
  it('lists the modes, the current one, and whether it is the thread’s own', () => {
    const { catalog } = fakeCatalog('terse')
    const control = new ModeControl(catalog)

    expect(handleModes(control, catalog, 'listModes', { threadId: 't1' })).toEqual({
      modes: MODES,
      current: 'terse',
      overridden: false,
    })

    control.set('t1', 'plain')
    expect(handleModes(control, catalog, 'listModes', { threadId: 't1' })).toMatchObject({
      current: 'plain',
      overridden: true,
    })
  })

  it('omits the current mode entirely when none is set', () => {
    const { catalog } = fakeCatalog(undefined)
    const answer = handleModes(new ModeControl(catalog), catalog, 'listModes', { threadId: 't1' })
    expect(answer).toEqual({ modes: MODES, overridden: false })
  })

  it('sets and clears the thread’s voice', () => {
    const { catalog } = fakeCatalog(undefined)
    const control = new ModeControl(catalog)

    handleModes(control, catalog, 'setThreadMode', { threadId: 't1', modeId: 'plain' })
    expect(control.overridden('t1')).toBe(true)

    handleModes(control, catalog, 'setThreadMode', { threadId: 't1' })
    expect(control.overridden('t1')).toBe(false)
  })

  it('sets the default, saves a mode, and deletes one', () => {
    const { catalog, state } = fakeCatalog(undefined)
    const control = new ModeControl(catalog)

    handleModes(control, catalog, 'setDefaultMode', { modeId: 'terse' })
    expect(state.defaultMode).toBe('terse')

    handleModes(control, catalog, 'saveMode', {
      mode: { id: 'loud', name: 'loud', instructions: 'shout' },
    })
    expect(state.modes.map((one) => one.id)).toContain('loud')

    handleModes(control, catalog, 'deleteMode', { modeId: 'loud' })
    expect(state.deleted).toEqual(['loud'])
  })
})
