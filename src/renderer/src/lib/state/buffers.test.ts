import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorHandle } from '../editor/editor'
import { session } from '../session'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
  },
  isDesktop: true,
}))

import { app } from './app.svelte'
import { buffers, UNSAVED_QUIT } from './buffers.svelte'
import { catalog } from './catalog.svelte'
import { toasts } from './toasts.svelte'
import { fileColumnId } from '../types'

const WORKSPACE = {
  id: 'w1',
  path: '/code/pi-core',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  snippet: '',
  git: null,
  threads: [
    { id: 't1', title: 'fix the scroll', status: 'idle' as const, meta: '', branch: null },
    { id: 't2', title: 'second', status: 'idle' as const, meta: '', branch: null },
  ],
}

const COLUMN = fileColumnId('w1', 'src/a.ts')

function fakeHandle(text = 'edited'): EditorHandle & { cleaned: number } {
  const handle = {
    cleaned: 0,
    text: () => text,
    setText: () => {},
    markClean() {
      handle.cleaned += 1
    },
    isDirty: () => false,
    focus: () => {},
    blur: () => {},
    enterNormal: () => {},
    enterInsert: () => {},
    notify: () => {},
    destroy: () => {},
  }
  return handle
}

function backendReads(text = 'file body', mtimeMs = 100) {
  return vi.spyOn(session, 'invoke').mockImplementation((name) =>
    Promise.resolve(
      (name === 'readFile'
        ? { text, mtimeMs }
        : name === 'writeFile'
          ? { mtimeMs: mtimeMs + 1 }
          : { ok: true }) as never,
    ),
  )
}

async function opened(): Promise<void> {
  backendReads()
  await buffers.open('w1', 'src/a.ts')
}

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  catalog.error = null
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'OCARINA'
  toasts.items = []
  buffers.close(COLUMN)
  toasts.items = []
})

describe('opening a buffer', () => {
  it('lands the column directly right of the focused one and focuses it', async () => {
    backendReads()

    const column = await buffers.open('w1', 'src/a.ts')

    expect(catalog.workspaces[0]?.threads.map((thread) => thread.id)).toEqual([
      't1',
      COLUMN,
      't2',
    ])
    expect(column).toBe(1)
    expect(app.threadIndex).toBe(1)
    expect(buffers.get(COLUMN)).toMatchObject({ path: 'src/a.ts', mtimeMs: 100, dirty: false })
  })

  it('focuses the existing column instead of opening a second one', async () => {
    await opened()
    app.focusThread(0)

    const column = await buffers.open('w1', 'src/a.ts')

    expect(column).toBe(1)
    expect(catalog.workspaces[0]?.threads.filter((one) => one.id === COLUMN)).toHaveLength(1)
    expect(app.threadIndex).toBe(1)
  })

  it('toasts a file that is gone and adds no column', async () => {
    vi.spyOn(session, 'invoke').mockResolvedValue({ missing: true } as never)

    expect(await buffers.open('w1', 'ghost.ts')).toBeNull()
    expect(catalog.workspaces[0]?.threads).toHaveLength(2)
    expect(toasts.items[0]?.text).toContain('ghost.ts')
  })

  it('does nothing without a live backend', async () => {
    const invoke = backendReads()
    catalog.source = 'mock'
    expect(await buffers.open('w1', 'src/a.ts')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe(':w', () => {
  it('writes with the loaded mtime and remembers the new one', async () => {
    await opened()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ mtimeMs: 200 } as never)
    const handle = fakeHandle('new body')
    buffers.register(COLUMN, handle)

    expect(await buffers.save(COLUMN, false)).toBe(true)
    expect(invoke).toHaveBeenCalledWith('writeFile', {
      workspaceId: 'w1',
      path: 'src/a.ts',
      text: 'new body',
      expectMtimeMs: 100,
    })
    expect(buffers.get(COLUMN)).toMatchObject({ mtimeMs: 200, dirty: false, notice: null })
    expect(handle.cleaned).toBe(1)
  })

  it('surfaces a stale refusal on the notice line and keeps the buffer', async () => {
    await opened()
    vi.spyOn(session, 'invoke').mockRejectedValue(
      new Error('file changed on disk — :w! to overwrite'),
    )
    buffers.register(COLUMN, fakeHandle())

    expect(await buffers.save(COLUMN, false)).toBe(false)
    expect(buffers.get(COLUMN)?.notice).toBe('file changed on disk — :w! to overwrite')
    expect(buffers.get(COLUMN)?.mtimeMs).toBe(100)
  })

  it('forces with a null expectation on :w!', async () => {
    await opened()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ mtimeMs: 300 } as never)
    buffers.register(COLUMN, fakeHandle())

    await buffers.save(COLUMN, true)

    expect(invoke).toHaveBeenCalledWith('writeFile', expect.objectContaining({ expectMtimeMs: null }))
  })
})

describe(':q and :qa', () => {
  it('closes a clean buffer and gives the mode back to the strip', async () => {
    await opened()
    app.mode = 'NORMAL'

    buffers.quit(COLUMN, false)

    expect(catalog.workspaces[0]?.threads.map((one) => one.id)).toEqual(['t1', 't2'])
    expect(buffers.get(COLUMN)).toBeUndefined()
    expect(app.mode).toBe('OCARINA')
  })

  it('refuses a dirty buffer and says how to force', async () => {
    await opened()
    buffers.setDirty(COLUMN, true)

    buffers.quit(COLUMN, false)

    expect(buffers.get(COLUMN)).toBeDefined()
    expect(buffers.get(COLUMN)?.notice).toBe(UNSAVED_QUIT)
  })

  it(':q! discards a dirty buffer', async () => {
    await opened()
    buffers.setDirty(COLUMN, true)

    buffers.quit(COLUMN, true)

    expect(buffers.get(COLUMN)).toBeUndefined()
  })

  it(':qa closes the clean and refuses the dirty', async () => {
    await opened()
    backendReads()
    const other = fileColumnId('w1', 'src/b.ts')
    await buffers.open('w1', 'src/b.ts')
    buffers.setDirty(other, true)

    buffers.quitAll(false)

    expect(buffers.get(COLUMN)).toBeUndefined()
    expect(buffers.get(other)?.notice).toBe(UNSAVED_QUIT)
    buffers.quitAll(true)
    expect(buffers.get(other)).toBeUndefined()
  })
})

describe('the mode mirror', () => {
  it('follows vim while the column is focused and in a vim mode', async () => {
    await opened()
    app.mode = 'NORMAL'
    buffers.mirrorMode(COLUMN, 'insert')
    expect(app.mode).toBe('INSERT')
    buffers.mirrorMode(COLUMN, 'normal')
    expect(app.mode).toBe('NORMAL')
  })

  it('says nothing when the strip has the keyboard', async () => {
    await opened()
    app.mode = 'OCARINA'
    buffers.mirrorMode(COLUMN, 'insert')
    expect(app.mode).toBe('OCARINA')
  })

  it('says nothing for a column that is not focused', async () => {
    await opened()
    app.mode = 'NORMAL'
    app.focusThread(0)
    buffers.mirrorMode(COLUMN, 'insert')
    expect(app.mode).toBe('NORMAL')
  })
})
