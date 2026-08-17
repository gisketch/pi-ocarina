import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addWorktree } from '../git/worktree'
import { WorkspaceService, type Sdk } from './workspaces'
import type { CatalogStore } from '../catalog-store'

const run = promisify(execFile)

/** pi lists sessions by working directory, so this stub does too — that is the
 *  whole reason an isolated thread needs finding twice. */
const sessions = new Map<string, { id: string; path: string; cwd: string }[]>()

const sdk = {
  SessionManager: {
    list: async (cwd: string) =>
      (sessions.get(cwd) ?? []).map((session) => ({
        ...session,
        name: session.id,
        firstMessage: undefined,
        modified: new Date('2026-08-17T10:00:00Z'),
        messageCount: 1,
      })),
  },
} as unknown as Sdk

let repo: string
let service: WorkspaceService
const archived: string[] = []

function store(): CatalogStore {
  const workspace = { id: 'w1', path: repo, name: 'repo' }
  return {
    snapshot: () => ({ workspaces: [workspace] }),
    workspace: (id: string) => (id === 'w1' ? workspace : undefined),
    listArchived: () => archived,
    archive: (_workspaceId: string, threadId: string) => archived.push(threadId),
    unarchive: () => {},
  } as unknown as CatalogStore
}

beforeEach(async () => {
  sessions.clear()
  archived.length = 0
  repo = await mkdtemp(join(tmpdir(), 'piocarina-workspaces-'))
  await run('git', ['init', '-b', 'main'], { cwd: repo })
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await run('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(repo, 'src', 'kept.txt'), 'one\n', 'utf8')
  await run('git', ['add', '-A'], { cwd: repo })
  await run('git', ['commit', '-m', 'first'], { cwd: repo })

  service = new WorkspaceService(store(), async () => sdk)
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('cwdForNewThread', () => {
  it('gives the workspace itself when no worktree is asked for', async () => {
    expect(await service.cwdForNewThread('w1')).toEqual({ cwd: repo, branch: null })
  })

  it('makes the checkout before any session exists', async () => {
    const { cwd, branch } = await service.cwdForNewThread('w1', { branch: 'fix/OCA-231' })

    expect(branch).toBe('fix/OCA-231')
    expect(cwd).toBe(join(repo, '.ocarina', 'worktrees', 'fix-OCA-231'))
    const { stdout } = await run('git', ['branch', '--show-current'], { cwd })
    expect(stdout.trim()).toBe('fix/OCA-231')
  })

  it('fails rather than falling back to the workspace', async () => {
    await service.cwdForNewThread('w1', { branch: 'taken' })

    await expect(service.cwdForNewThread('w1', { branch: 'taken' })).rejects.toThrow(/already/)
  })
})

describe('listThreads', () => {
  it('finds a thread living in a worktree, and says which branch', async () => {
    const tree = await addWorktree(repo, 'feat/isolated')
    sessions.set(repo, [{ id: 'plain', path: join(repo, 'plain.jsonl'), cwd: repo }])
    sessions.set(tree, [{ id: 'alone', path: join(tree, 'alone.jsonl'), cwd: tree }])

    const listed = await service.listThreads('w1')

    expect(listed.map((thread) => [thread.id, thread.branch])).toEqual(
      expect.arrayContaining([
        ['plain', null],
        ['alone', 'feat/isolated'],
      ]),
    )
  })

  it('remembers where an isolated thread is, and on what branch', async () => {
    const tree = await addWorktree(repo, 'feat/remembered')
    sessions.set(tree, [{ id: 'alone', path: join(tree, 'alone.jsonl'), cwd: tree }])

    await service.listThreads('w1')

    expect(service.cwdOf('alone')).toBe(tree)
    expect(service.branchOf('alone')).toBe('feat/remembered')
  })

  it('scopes an isolated thread to the workspace that owns its worktree', async () => {
    const tree = await addWorktree(repo, 'feat/owned')
    sessions.set(tree, [{ id: 'alone', path: join(tree, 'alone.jsonl'), cwd: tree }])
    await service.listThreads('w1')

    expect(service.idForPath(tree)).toBe('w1')

    await service.setArchived('alone', true)
    expect(archived).toEqual(['alone'])
    expect(await service.listThreads('w1')).toEqual([])
  })
})
