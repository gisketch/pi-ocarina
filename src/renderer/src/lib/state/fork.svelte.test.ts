import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadId } from '../../../../shared/thread-id'
import { session } from '../session'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
  },
  isDesktop: true,
}))

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { withThreadAfter } from './catalog-build'
import { forkAtCheckpoint } from './fork.svelte'
import { toasts } from './toasts.svelte'

const T1 = 't1' as ThreadId
const T2 = 't2' as ThreadId
const FORKED = 'forked' as ThreadId

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

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  catalog.error = null
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  toasts.items = []
})

function backendAnswers() {
  return vi.spyOn(session, 'invoke').mockImplementation((name) =>
    Promise.resolve((name === 'forkThread' ? { threadId: FORKED } : { ok: true }) as never),
  )
}

describe('withThreadAfter', () => {
  const made = { id: 'x', title: 'made', status: 'idle' as const, meta: '' }

  it('places the column directly right of the anchor', () => {
    const placed = withThreadAfter([structuredClone(WORKSPACE)], 'w1', 't1', made)
    expect(placed[0]?.threads.map((thread) => thread.id)).toEqual(['t1', 'x', 't2'])
  })

  it('appends when the anchor has left the strip', () => {
    const placed = withThreadAfter([structuredClone(WORKSPACE)], 'w1', 'gone', made)
    expect(placed[0]?.threads.map((thread) => thread.id)).toEqual(['t1', 't2', 'x'])
  })

  it('moves rather than duplicates an id already present', () => {
    const again = { ...made, id: 't2' }
    const placed = withThreadAfter([structuredClone(WORKSPACE)], 'w1', 't1', again)
    expect(placed[0]?.threads.map((thread) => thread.id)).toEqual(['t1', 't2'])
  })

  it('leaves other workspaces alone', () => {
    const other = { ...structuredClone(WORKSPACE), id: 'w2' }
    const placed = withThreadAfter([structuredClone(WORKSPACE), other], 'w1', 't1', made)
    expect(placed[1]?.threads.map((thread) => thread.id)).toEqual(['t1', 't2'])
  })
})

describe('forkAtCheckpoint', () => {
  it('asks the backend with the Fork - title and places the column right of the parent', async () => {
    const invoke = backendAnswers()

    const column = await forkAtCheckpoint(T1, 'cp-1')

    expect(invoke).toHaveBeenCalledWith('forkThread', {
      threadId: 't1',
      checkpointId: 'cp-1',
      title: 'Fork - fix the scroll',
    })
    expect(catalog.workspaces[0]?.threads.map((thread) => thread.id)).toEqual([
      't1',
      'forked',
      't2',
    ])
    expect(column).toBe(1)
    expect(catalog.workspaces[0]?.threads[1]?.title).toBe('Fork - fix the scroll')
  })

  it('carries the parent branch onto the fork column', async () => {
    backendAnswers()
    catalog.workspaces = [
      {
        ...structuredClone(WORKSPACE),
        threads: [{ id: 't1', title: 'isolated', status: 'idle', meta: '', branch: 'wip' }],
      },
    ]

    await forkAtCheckpoint(T1, 'cp-1')

    expect(catalog.workspaces[0]?.threads[1]?.branch).toBe('wip')
  })

  it('does nothing without a live backend', async () => {
    const invoke = backendAnswers()
    catalog.source = 'mock'

    expect(await forkAtCheckpoint(T1, 'cp-1')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does nothing when the parent has left the strip', async () => {
    const invoke = backendAnswers()

    expect(await forkAtCheckpoint('gone' as ThreadId, 'cp-1')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('toasts a refusal and adds no column', async () => {
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('no such checkpoint'))

    expect(await forkAtCheckpoint(T2, 'cp-9')).toBeNull()
    expect(catalog.workspaces[0]?.threads.length).toBe(2)
    expect(toasts.items[0]?.text).toBe('no such checkpoint')
  })
})
