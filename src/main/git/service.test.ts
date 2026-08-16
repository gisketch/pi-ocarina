import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatus } from '../../shared/protocol'
import { EMPTY_STATUS } from './porcelain'
import { GitService } from './service'

const CLEAN: GitStatus = { ...EMPTY_STATUS, branch: 'main' }
const DIRTY: GitStatus = { ...EMPTY_STATUS, branch: 'main', modified: 1 }

/** A folder with no `.git`, so the watcher finds nothing to watch and the test
 *  exercises the read path alone. */
let path: string

beforeEach(async () => {
  vi.useFakeTimers()
  path = await mkdtemp(join(tmpdir(), 'piocarina-git-'))
})

afterEach(() => {
  vi.useRealTimers()
})

function build(read: (cwd: string) => Promise<GitStatus | null>) {
  const emitted: { workspaceId: string; status: GitStatus | null }[] = []
  const service = new GitService({
    pathOf: (workspaceId) => (workspaceId === 'w1' ? path : null),
    emit: (workspaceId, status) => emitted.push({ workspaceId, status }),
    read,
  })
  return { service, emitted }
}

describe('refreshing', () => {
  it('publishes what git said', async () => {
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(emitted).toEqual([{ workspaceId: 'w1', status: CLEAN }])
    service.disposeAll()
  })

  it('turns a burst of requests into one git run', async () => {
    // A single `git commit` writes the index, HEAD and a ref in quick
    // succession. Reading after each would run git three times.
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service, emitted } = build(read)

    service.refresh('w1')
    service.refresh('w1')
    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(read).toHaveBeenCalledTimes(1)
    expect(emitted).toHaveLength(1)
    service.disposeAll()
  })

  it('says nothing when the state has not changed', async () => {
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.runAllTimersAsync()
    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(read).toHaveBeenCalledTimes(2)
    expect(emitted).toHaveLength(1)
    service.disposeAll()
  })

  it('publishes the change when it comes', async () => {
    const read = vi.fn().mockResolvedValueOnce(CLEAN).mockResolvedValue(DIRTY)
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.runAllTimersAsync()
    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(emitted.map((entry) => entry.status)).toEqual([CLEAN, DIRTY])
    service.disposeAll()
  })

  it('reads again for a request that arrived mid-read', async () => {
    // The in-flight read may have started before the change it is asked about.
    let release: (status: GitStatus) => void = () => {}
    const read = vi
      .fn()
      .mockImplementationOnce(() => new Promise<GitStatus>((resolve) => (release = resolve)))
      .mockResolvedValue(DIRTY)
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.advanceTimersByTimeAsync(200)
    service.refresh('w1')
    await vi.advanceTimersByTimeAsync(200)
    release(CLEAN)
    await vi.runAllTimersAsync()

    expect(read).toHaveBeenCalledTimes(2)
    expect(emitted.map((entry) => entry.status)).toEqual([CLEAN, DIRTY])
    service.disposeAll()
  })

  it('reports a folder that is not a repository, once', async () => {
    const read = vi.fn().mockResolvedValue(null)
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.runAllTimersAsync()
    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(emitted).toEqual([{ workspaceId: 'w1', status: null }])
    service.disposeAll()
  })

  it('publishes nothing for a folder that is no longer pinned', async () => {
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service, emitted } = build(read)

    service.refresh('gone')
    await vi.runAllTimersAsync()

    expect(read).not.toHaveBeenCalled()
    expect(emitted).toHaveLength(0)
  })

  it('treats a git that threw as no repository rather than crashing', async () => {
    const read = vi.fn().mockRejectedValue(new Error('git: command not found'))
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(emitted).toEqual([{ workspaceId: 'w1', status: null }])
    service.disposeAll()
  })
})

describe('forgetting a workspace', () => {
  it('drops its state and stops watching it', async () => {
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service, emitted } = build(read)
    service.refresh('w1')
    await vi.runAllTimersAsync()

    service.forget('w1')
    service.refresh('w1')
    await vi.runAllTimersAsync()

    // Re-asked from scratch, so the state is published again rather than
    // suppressed as unchanged against a workspace that no longer exists.
    expect(emitted).toHaveLength(2)
    service.disposeAll()
  })

  it('does not publish a read that lands after the unpin', async () => {
    let release: (status: GitStatus) => void = () => {}
    const read = vi.fn().mockImplementation(
      () => new Promise<GitStatus>((resolve) => (release = resolve)),
    )
    const { service, emitted } = build(read)

    service.refresh('w1')
    await vi.advanceTimersByTimeAsync(200)
    service.forget('w1')
    release(CLEAN)
    await vi.runAllTimersAsync()

    expect(emitted).toHaveLength(0)
  })
})

describe('statuses', () => {
  it('reports only what has actually been read', async () => {
    const read = vi.fn().mockResolvedValue(CLEAN)
    const { service } = build(read)

    expect(service.statuses()).toEqual([])
    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(service.statuses()).toEqual([{ workspaceId: 'w1', status: CLEAN }])
    service.disposeAll()
  })
})

describe('watching', () => {
  it('starts without a .git folder rather than failing', async () => {
    await mkdir(join(path, 'src'), { recursive: true })
    await writeFile(join(path, 'src', 'one.ts'), 'x', 'utf8')
    const { service, emitted } = build(() => Promise.resolve(null))

    service.refresh('w1')
    await vi.runAllTimersAsync()

    expect(emitted).toEqual([{ workspaceId: 'w1', status: null }])
    service.disposeAll()
  })
})
