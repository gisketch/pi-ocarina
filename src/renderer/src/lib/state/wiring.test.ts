import { beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: {
      refresh: (...args: unknown[]) => refresh(...args),
      statuses: () => Promise.resolve([]),
      onStatus: () => () => {},
      changes: () => Promise.resolve({ changes: [], message: '' }),
      commit: () => Promise.resolve({ ok: true, pushed: false }),
      push: () => Promise.resolve({ ok: true, pushed: true }),
    },
    terminal: {
      create: () => Promise.resolve({ ok: true }),
      kill: () => Promise.resolve({ ok: true }),
      write: () => {},
      resize: () => {},
      busy: () => Promise.resolve({ busy: false }),
      onData: () => () => {},
    },
  },
  isDesktop: true,
}))

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { watchFocusedGit, watchPinnedGit } from './wiring.svelte'

function workspace(id: string) {
  return {
    id,
    name: id,
    note: 'D',
    hue: 152,
    git: null,
    snippet: `/code/${id}`,
    threads: [{ id: `${id}-s1`, title: 'first', status: 'idle' as const, meta: '' }],
  }
}

beforeEach(() => {
  refresh.mockClear()
  catalog.workspaces = [workspace('w1'), workspace('w2')]
  catalog.source = 'live'
  app.goWorkspace(0)
  // Both watchers remember across calls, so each test starts them from where
  // the last one left them — drained here rather than reset.
  watchPinnedGit()
  watchFocusedGit()
  refresh.mockClear()
})

// Both watchers read `catalog.workspaces`, and publishing a status rewrites
// that array. Without memory, one workspace's answer would cost a git run in
// every workspace — a fan-out that grows with the square of the pin count.
describe('watchPinnedGit', () => {
  it('asks about nothing when the same workspaces come round again', () => {
    catalog.workspaces = [workspace('w1'), workspace('w2')]

    watchPinnedGit()

    expect(refresh).not.toHaveBeenCalled()
  })

  it('asks about a folder that was just pinned, and only that one', () => {
    catalog.workspaces = [...catalog.workspaces, workspace('w3')]

    watchPinnedGit()

    expect(refresh.mock.calls).toEqual([['w3']])
  })

  it('asks again about a folder unpinned and pinned back', () => {
    catalog.workspaces = [workspace('w1')]
    watchPinnedGit()
    refresh.mockClear()

    catalog.workspaces = [workspace('w1'), workspace('w2')]
    watchPinnedGit()

    expect(refresh.mock.calls).toEqual([['w2']])
  })
})

describe('watchFocusedGit', () => {
  it('asks nothing while the focus stays where it is', () => {
    watchFocusedGit()

    expect(refresh).not.toHaveBeenCalled()
  })

  it('asks about a workspace the moment it is focused', () => {
    app.goWorkspace(1)

    watchFocusedGit()

    expect(refresh.mock.calls).toEqual([['w2']])
  })
})
