import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitCommitResult } from '../../../../shared/protocol'

const changes = vi.fn()
const commitCall = vi.fn()
const push = vi.fn()

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
      push: (...args: unknown[]) => push(...args),
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
  threads: [{ id: 's1', title: 'first', status: 'idle' as const, meta: '' }],
}

const EDIT = { path: 'src/one.ts', status: 'M' as const, added: 3, removed: 1 }
const ok = (pushed: boolean): GitCommitResult => ({ ok: true, pushed })

beforeEach(() => {
  vi.clearAllMocks()
  toasts.reset()
  commit.close()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  changes.mockResolvedValue({ changes: [EDIT], message: 'update src/one.ts' })
  commitCall.mockResolvedValue(ok(false))
  push.mockResolvedValue(ok(true))
})

describe('opening the card', () => {
  it('shows what would be committed, and a message to start from', async () => {
    await commit.load()

    expect(changes).toHaveBeenCalledWith('w1')
    expect(commit.open).toBe(true)
    expect(commit.changes).toEqual([EDIT])
    expect(commit.message).toBe('update src/one.ts')
  })

  it('commits nothing by opening', async () => {
    await commit.load()

    expect(commitCall).not.toHaveBeenCalled()
  })

  it('reports a read it could not make', async () => {
    changes.mockRejectedValue(new Error('unknown workspace'))

    await commit.load()

    expect(commit.error).toBe('unknown workspace')
    expect(commit.changes).toEqual([])
  })
})

describe('committing', () => {
  beforeEach(async () => {
    await commit.load()
  })

  it('commits the message the card shows', async () => {
    await commit.run({ push: false })

    expect(commitCall).toHaveBeenCalledWith('w1', { message: 'update src/one.ts', push: false })
    expect(commit.open).toBe(false)
    expect(toasts.items[0]).toMatchObject({ tone: 'ok', text: 'committed' })
  })

  it('commits the edited message', async () => {
    commit.message = 'fix: bounded retry'

    await commit.run({ push: false })

    expect(commitCall).toHaveBeenCalledWith('w1', { message: 'fix: bounded retry', push: false })
  })

  it('says so when it pushed as well', async () => {
    commitCall.mockResolvedValue(ok(true))

    await commit.run({ push: true })

    expect(toasts.items[0]).toMatchObject({ text: 'committed and pushed' })
  })

  it('keeps the card open and names the reason when the commit failed', async () => {
    commitCall.mockResolvedValue({ ok: false, stage: 'commit', reason: 'nothing to commit' })

    await commit.run({ push: false })

    expect(commit.open).toBe(true)
    expect(commit.error).toBe('nothing to commit')
  })

  it('refuses to commit an empty change set', async () => {
    commit.changes = []

    await commit.run({ push: false })

    expect(commitCall).not.toHaveBeenCalled()
  })
})

describe('a push that failed', () => {
  beforeEach(async () => {
    await commit.load()
    commitCall.mockResolvedValue({ ok: false, stage: 'push', reason: 'rejected — pull first' })
  })

  it('closes the card, because the commit was made', async () => {
    await commit.run({ push: true })

    expect(commit.open).toBe(false)
  })

  it('offers a retry that pushes without committing again', async () => {
    await commit.run({ push: true })

    const toast = toasts.items[0]
    expect(toast).toMatchObject({ tone: 'error', label: 'retry' })
    expect(toast.text).toContain('rejected — pull first')

    commitCall.mockClear()
    toast.run?.()
    await Promise.resolve()

    expect(push).toHaveBeenCalledWith('w1')
    expect(commitCall).not.toHaveBeenCalled()
  })

  it('offers the retry again when the retry itself fails', async () => {
    await commit.run({ push: true })
    push.mockResolvedValue({ ok: false, stage: 'push', reason: 'still rejected' })

    await commit.retryPush('w1')

    expect(toasts.items.at(-1)).toMatchObject({ label: 'retry', tone: 'error' })
  })
})

describe('the card keys', () => {
  beforeEach(async () => {
    await commit.load()
  })

  it('commits on c and pushes on p', () => {
    commit.handleKey({ key: 'c' })
    expect(commitCall).toHaveBeenCalledWith('w1', expect.objectContaining({ push: false }))

    commit.close()
    commit.workspaceId = 'w1'
    commit.changes = [EDIT]
    commit.handleKey({ key: 'p' })
    expect(commitCall).toHaveBeenCalledWith('w1', expect.objectContaining({ push: true }))
  })

  it('closes on escape without committing', () => {
    commit.handleKey({ key: 'Escape' })

    expect(commit.open).toBe(false)
    expect(commitCall).not.toHaveBeenCalled()
  })

  it('opens the message for editing on e', () => {
    commit.handleKey({ key: 'e' })

    expect(commit.editing).toBe(true)
  })

  it('lets the message field keep its own keys while editing', () => {
    commit.editing = true

    // `c` inside the message is a letter someone typed, not a commit.
    expect(commit.handleKey({ key: 'c' })).toBe(false)
    expect(commitCall).not.toHaveBeenCalled()
  })

  it('ends editing on enter rather than committing on it', () => {
    commit.editing = true

    expect(commit.handleKey({ key: 'Enter' })).toBe(true)
    expect(commit.editing).toBe(false)
    expect(commitCall).not.toHaveBeenCalled()
  })

  it('swallows every other key rather than letting a binding run underneath', () => {
    expect(commit.handleKey({ key: 'l' })).toBe(true)
  })

  it('lets a bare modifier through', () => {
    expect(commit.handleKey({ key: 'Shift' })).toBe(false)
  })

  it('ignores a second commit key while git is still running', () => {
    commit.running = true

    commit.handleKey({ key: 'c' })

    expect(commitCall).not.toHaveBeenCalled()
  })
})
