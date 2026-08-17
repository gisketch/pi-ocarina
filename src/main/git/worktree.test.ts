import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addWorktree, listWorktrees, removeWorktree, worktreeRoot, worktreeState } from './worktree'

const run = promisify(execFile)

/** Against a real repository: every claim here is about what git does. */
let repo: string

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd })
  return stdout
}

async function write(root: string, path: string, body: string): Promise<void> {
  await mkdir(join(root, path, '..'), { recursive: true })
  await writeFile(join(root, path), body, 'utf8')
}

async function commitIn(root: string, subject: string): Promise<void> {
  await git(root, 'add', '-A')
  await git(root, 'commit', '-m', subject)
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'piocarina-worktree-'))
  await git(repo, 'init', '-b', 'main')
  await git(repo, 'config', 'user.email', 'test@example.com')
  await git(repo, 'config', 'user.name', 'Test')
  await write(repo, 'kept.txt', 'one\n')
  await commitIn(repo, 'first')
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('addWorktree', () => {
  it('checks out a new branch in its own directory', async () => {
    const path = await addWorktree(repo, 'fix/OCA-231')

    expect(path).toBe(join(worktreeRoot(repo), 'fix-OCA-231'))
    expect(await readFile(join(path, 'kept.txt'), 'utf8')).toBe('one\n')
    expect((await git(path, 'branch', '--show-current')).trim()).toBe('fix/OCA-231')
  })

  it('leaves the workspace status clean', async () => {
    await addWorktree(repo, 'feat/quiet')

    expect(await git(repo, 'status', '--porcelain')).toBe('')
  })

  it('writes the exclude line once', async () => {
    await addWorktree(repo, 'one')
    await addWorktree(repo, 'two')

    const body = await readFile(join(repo, '.git', 'info', 'exclude'), 'utf8')
    const written = body.split('\n').filter((line) => line.trim() === '.ocarina/')
    expect(written).toHaveLength(1)
  })

  it('reports the reason when the branch is taken', async () => {
    await addWorktree(repo, 'taken')

    await expect(addWorktree(repo, 'taken')).rejects.toThrow(/already/)
  })
})

describe('listWorktrees', () => {
  it('names the main checkout and every worktree', async () => {
    await addWorktree(repo, 'feat/listed')

    const branches = (await listWorktrees(repo)).map((tree) => tree.branch)
    expect(branches).toContain('main')
    expect(branches).toContain('feat/listed')
  })
})

describe('worktreeState', () => {
  it('counts nothing in a fresh worktree', async () => {
    const path = await addWorktree(repo, 'fresh')

    expect(await worktreeState(path)).toEqual({ dirty: 0, commits: 0 })
  })

  it('counts uncommitted files', async () => {
    const path = await addWorktree(repo, 'dirty')
    await write(path, 'kept.txt', 'two\n')
    await write(path, 'new.txt', 'new\n')

    expect((await worktreeState(path)).dirty).toBe(2)
  })

  it('counts commits that exist on no other branch', async () => {
    const path = await addWorktree(repo, 'busy')
    await git(path, 'config', 'user.email', 'test@example.com')
    await git(path, 'config', 'user.name', 'Test')
    await write(path, 'kept.txt', 'two\n')
    await commitIn(path, 'second')

    expect(await worktreeState(path)).toEqual({ dirty: 0, commits: 1 })
  })
})

describe('removeWorktree', () => {
  it('takes a clean worktree away', async () => {
    const path = await addWorktree(repo, 'gone')
    await removeWorktree(repo, path)

    const paths = (await listWorktrees(repo)).map((tree) => tree.path)
    expect(paths).not.toContain(path)
  })

  it('refuses a dirty one until forced', async () => {
    const path = await addWorktree(repo, 'held')
    await write(path, 'kept.txt', 'two\n')

    await expect(removeWorktree(repo, path)).rejects.toThrow()
    await removeWorktree(repo, path, { force: true })

    const paths = (await listWorktrees(repo)).map((tree) => tree.path)
    expect(paths).not.toContain(path)
  })
})
