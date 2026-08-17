import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addWorktree, listWorktrees } from '../git/worktree'
import { dropWorktree, dropWorktreeAt, threadGitStatus, worktreeOf } from './thread-worktree'
import type { WorkspaceService } from './workspaces'

const run = promisify(execFile)

let repo: string
let tree: string

/** Only the two questions this module asks a workspace. */
function service(threads: Record<string, { cwd: string; branch: string | null }>): WorkspaceService {
  return {
    branchOf: (threadId: string) => threads[threadId]?.branch ?? null,
    cwdOf: (threadId: string) => threads[threadId]?.cwd,
    pathOf: () => repo,
    retire: (_path: string, branch: string) => retired.push(branch),
  } as unknown as WorkspaceService
}

/** Branches whose checkout was removed, so its threads stay listed. */
let retired: string[] = []

function checkouts(trees: { path: string }[]): string[] {
  return trees.map((one) => basename(one.path))
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd })
}

beforeEach(async () => {
  retired = []
  repo = await mkdtemp(join(tmpdir(), 'piocarina-thread-worktree-'))
  await git(repo, 'init', '-b', 'main')
  await git(repo, 'config', 'user.email', 'test@example.com')
  await git(repo, 'config', 'user.name', 'Test')
  await writeFile(join(repo, 'kept.txt'), 'one\n', 'utf8')
  await git(repo, 'add', '-A')
  await git(repo, 'commit', '-m', 'first')
  tree = await addWorktree(repo, 'fix/OCA-231')
  await git(tree, 'config', 'user.email', 'test@example.com')
  await git(tree, 'config', 'user.name', 'Test')
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('worktreeOf', () => {
  it('answers null for a thread in the workspace itself', async () => {
    const workspaces = service({ plain: { cwd: repo, branch: null } })

    expect(await worktreeOf(workspaces, 'plain')).toBeNull()
    expect(await threadGitStatus(workspaces, 'plain')).toBeNull()
  })

  it('reports the branch and what it holds', async () => {
    const workspaces = service({ alone: { cwd: tree, branch: 'fix/OCA-231' } })

    expect(await worktreeOf(workspaces, 'alone')).toEqual({
      branch: 'fix/OCA-231',
      path: tree,
      dirty: 0,
      commits: 0,
    })
    expect((await threadGitStatus(workspaces, 'alone'))?.branch).toBe('fix/OCA-231')
  })
})

describe('dropWorktree', () => {
  it('takes a clean one away, and remembers the branch it took', async () => {
    const workspaces = service({ alone: { cwd: tree, branch: 'fix/OCA-231' } })

    expect(await dropWorktree(workspaces, 'alone', false)).toEqual({ ok: true })
    // Without this the thread that lived there stops being listed at all, and
    // history search loses a transcript that is still on disk.
    expect(retired).toEqual(['fix/OCA-231'])
    // git reports resolved paths; the name is what identifies the checkout.
    expect(checkouts(await listWorktrees(repo))).not.toContain(basename(tree))
  })

  it('refuses uncommitted work until it is forced', async () => {
    await writeFile(join(tree, 'kept.txt'), 'two\n', 'utf8')
    const workspaces = service({ alone: { cwd: tree, branch: 'fix/OCA-231' } })

    expect(await dropWorktree(workspaces, 'alone', false)).toEqual({
      ok: false,
      reason: 'the worktree has uncommitted work',
    })
    expect(await dropWorktree(workspaces, 'alone', true)).toEqual({ ok: true })
  })

  it('never removes a tree whose branch holds commits, forced or not', async () => {
    await writeFile(join(tree, 'kept.txt'), 'two\n', 'utf8')
    await git(tree, 'add', '-A')
    await git(tree, 'commit', '-m', 'second')
    const workspaces = service({ alone: { cwd: tree, branch: 'fix/OCA-231' } })

    expect(await dropWorktree(workspaces, 'alone', true)).toEqual({
      ok: false,
      reason: 'the branch holds commits',
    })
    expect(checkouts(await listWorktrees(repo))).toContain(basename(tree))
  })

  it('is a no-op for a thread with no worktree', async () => {
    const workspaces = service({ plain: { cwd: repo, branch: null } })

    expect(await dropWorktree(workspaces, 'plain', true)).toEqual({ ok: true })
  })
})

describe('dropWorktreeAt', () => {
  it('refuses a path outside the workspace it was asked about', async () => {
    const workspaces = { pathOf: () => repo, retire: () => {} } as unknown as WorkspaceService

    expect(await dropWorktreeAt(workspaces, 'w1', '/tmp/somewhere/else', true)).toEqual({
      ok: false,
      reason: 'not a worktree this workspace made',
    })
    expect(await dropWorktreeAt(workspaces, 'w1', join(repo, 'src'), true)).toEqual({
      ok: false,
      reason: 'not a worktree this workspace made',
    })
    expect(checkouts(await listWorktrees(repo))).toContain(basename(tree))
  })

  it('removes one it does own', async () => {
    const workspaces = service({})

    expect(await dropWorktreeAt(workspaces, 'w1', tree, false)).toEqual({ ok: true })
    expect(checkouts(await listWorktrees(repo))).not.toContain(basename(tree))
    expect(retired).toEqual(['fix/OCA-231'])
  })
})
