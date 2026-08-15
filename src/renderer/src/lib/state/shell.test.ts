import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'

/** Waits for the promise chain and the queued microtask the focus handoff uses. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  branch: '',
  git: '',
  snippet: '/code/pi-core',
  threads: [{ id: 's1', title: 'first', status: 'idle' as const, meta: '' }],
}

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [WORKSPACE]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  shell.targets.composer = null
})

describe('leader n', () => {
  it('focuses the new column and hands it the caret', async () => {
    const composer = { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLElement
    shell.targets.composer = composer
    vi.spyOn(catalog, 'newThread').mockImplementation(async () => {
      catalog.workspaces = [
        { ...WORKSPACE, threads: [...WORKSPACE.threads, { id: 's2', title: 'new thread', status: 'idle', meta: '' }] },
      ]
      return 's2'
    })

    shell.newThread()
    await settle()

    expect(app.threadIndex).toBe(1)
    expect(app.thread.id).toBe('s2')
    expect(app.mode).toBe('INSERT')
    expect(composer.focus).toHaveBeenCalled()
  })

  it('pins a folder instead when there is no live workspace', () => {
    catalog.source = 'empty'
    const pin = vi.spyOn(catalog, 'pin').mockResolvedValue(true)
    const create = vi.spyOn(catalog, 'newThread')

    shell.newThread()

    expect(pin).toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('leaves focus alone when the thread could not be created', async () => {
    vi.spyOn(catalog, 'newThread').mockResolvedValue(null)

    shell.newThread()
    await settle()

    expect(app.threadIndex).toBe(0)
    expect(app.mode).toBe('NORMAL')
  })

  it('does not steal the caret back if the person moved on', async () => {
    catalog.workspaces = [WORKSPACE, { ...WORKSPACE, id: 'w2', name: 'other' }]
    app.focus = [0, 0]
    vi.spyOn(catalog, 'newThread').mockImplementation(async () => {
      // The person switched workspace while the backend was working.
      app.goWorkspace(1)
      return 's2'
    })

    shell.newThread()
    await settle()

    expect(app.workspaceIndex).toBe(1)
    expect(app.mode).toBe('NORMAL')
  })
})
