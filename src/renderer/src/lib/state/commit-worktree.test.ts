import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitCommitResult } from '../../../../shared/protocol'

const changes = vi.fn()
const commitCall = vi.fn()
const pullRequest = vi.fn()

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: {
      refresh: () => {},
      statuses: () => Promise.resolve([]),
      onStatus: () => () => {},
      changes: (...args: unknown[]) => changes(...args),
      commit: (...args: unknown[]) => commitCall(...args),
      push: () => Promise.resolve({ ok: true, pushed: true }),
      pullRequest: (...args: unknown[]) => pullRequest(...args),
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
import { commit } from './commit.svelte'
import { toasts } from './toasts.svelte'

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  git: null,
  snippet: '/code/pi-core',
  threads: [
    { id: 's1', title: 'isolated', status: 'idle' as const, meta: '', branch: 'fix/OCA-231' },
  ],
}

const EDIT = { path: 'src/one.ts', status: 'M' as const, added: 3, removed: 1 }
const committed: GitCommitResult = { ok: true, pushed: false }

const opened = vi.fn()

beforeEach(async () => {
  vi.clearAllMocks()
  toasts.reset()
  commit.close()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  changes.mockResolvedValue({ changes: [EDIT], message: 'update src/one.ts', remote: true })
  commitCall.mockResolvedValue(committed)
  pullRequest.mockResolvedValue({ ok: true, url: 'https://host/o/r/compare/x', branch: 'fix/OCA-231' })
  vi.stubGlobal('open', opened)
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  await commit.load()
})

describe('the card on an isolated thread', () => {
  it('reads and commits against that thread, not the workspace', async () => {
    expect(changes).toHaveBeenCalledWith('w1', 's1')
    expect(commit.branch).toBe('fix/OCA-231')

    await commit.commitAndOpen()

    expect(commitCall).toHaveBeenCalledWith('w1', expect.objectContaining({ threadId: 's1' }))
  })

  it('commits, pushes and opens the page in one action', async () => {
    await commit.commitAndOpen()

    expect(pullRequest).toHaveBeenCalledWith('w1', 's1')
    expect(opened).toHaveBeenCalledWith('https://host/o/r/compare/x', '_blank')
    expect(toasts.items.at(-1)?.text).toBe('pushed fix/OCA-231')
  })

  it('does not push when the commit failed', async () => {
    commitCall.mockResolvedValueOnce({ ok: false, stage: 'commit', reason: 'nothing to commit' })

    await commit.commitAndOpen()

    expect(pullRequest).not.toHaveBeenCalled()
    expect(commit.error).toBe('nothing to commit')
  })

  it('copies the branch when no page could be worked out', async () => {
    pullRequest.mockResolvedValueOnce({ ok: true, url: null, branch: 'fix/OCA-231' })

    await commit.commitAndOpen()

    expect(opened).not.toHaveBeenCalled()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('fix/OCA-231')
    expect(toasts.items.at(-1)?.text).toContain('branch name copied')
  })

  it('copies the branch even when a page opened, since it may be the wrong one', async () => {
    pullRequest.mockResolvedValueOnce({ ok: true, url: 'https://host/o/r', branch: 'fix/OCA-231' })

    await commit.commitAndOpen()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('fix/OCA-231')
  })

  it('says why the push failed, and opens nothing', async () => {
    pullRequest.mockResolvedValueOnce({ ok: false, reason: 'no upstream' })

    await commit.commitAndOpen()

    expect(opened).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)).toMatchObject({ tone: 'error', text: 'push failed — no upstream' })
  })

  it('will not push at all without a remote', async () => {
    changes.mockResolvedValueOnce({ changes: [EDIT], message: 'update', remote: false })
    await commit.load()

    expect(commit.handleKey({ key: 'p' })).toBe(true)
    expect(commitCall).not.toHaveBeenCalled()
    expect(pullRequest).not.toHaveBeenCalled()
  })
})
