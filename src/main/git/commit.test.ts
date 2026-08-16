import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commitAll, proposeMessage, pushCommits, readChanges } from './commit'

const run = promisify(execFile)

/** Against a real repository: every claim here is about what git does. */
let repo: string

async function git(...args: string[]): Promise<void> {
  await run('git', args, { cwd: repo })
}

async function write(path: string, body: string): Promise<void> {
  await mkdir(join(repo, path, '..'), { recursive: true })
  await writeFile(join(repo, path), body, 'utf8')
}

async function head(): Promise<string> {
  const { stdout } = await run('git', ['log', '-1', '--pretty=%s'], { cwd: repo })
  return stdout.trim()
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'piocarina-commit-'))
  await git('init', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'Test')
  await write('kept.txt', 'one\ntwo\n')
  await git('add', '.')
  await git('commit', '-m', 'first')
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('readChanges', () => {
  it('lists nothing in a clean repository', async () => {
    expect(await readChanges(repo)).toEqual([])
  })

  it('counts an edit', async () => {
    await write('kept.txt', 'one\ntwo\nthree\n')

    expect(await readChanges(repo)).toEqual([
      { path: 'kept.txt', status: 'M', added: 1, removed: 0 },
    ])
  })

  it('counts a file git has never seen', async () => {
    await write('new.txt', 'a\nb\nc\n')

    expect(await readChanges(repo)).toEqual([{ path: 'new.txt', status: 'A', added: 3, removed: 0 }])
  })

  it('lists a staged file and an unstaged one together, once each', async () => {
    await write('kept.txt', 'one\ntwo\nthree\n')
    await git('add', 'kept.txt')
    await write('other.txt', 'x\n')

    const changes = await readChanges(repo)

    expect(changes.map((change) => change.path)).toEqual(['kept.txt', 'other.txt'])
  })

  it('counts a file that was staged and then edited again once', async () => {
    await write('kept.txt', 'one\ntwo\nthree\n')
    await git('add', 'kept.txt')
    await write('kept.txt', 'one\ntwo\nthree\nfour\n')

    expect(await readChanges(repo)).toEqual([
      { path: 'kept.txt', status: 'M', added: 2, removed: 0 },
    ])
  })

  it('names a deleted file as deleted', async () => {
    // numstat alone cannot tell this apart from a file whose every line was
    // removed, and calling it a modification would draw the wrong letter.
    await rm(join(repo, 'kept.txt'))

    expect(await readChanges(repo)).toEqual([
      { path: 'kept.txt', status: 'D', added: 0, removed: 2 },
    ])
  })

  it('names a file emptied but still there as a modification', async () => {
    await write('kept.txt', '')

    expect(await readChanges(repo)).toEqual([
      { path: 'kept.txt', status: 'M', added: 0, removed: 2 },
    ])
  })

  it('names a staged new file as added', async () => {
    await write('new.ts', 'x\n')
    await git('add', 'new.ts')

    expect(await readChanges(repo)).toEqual([
      { path: 'new.ts', status: 'A', added: 1, removed: 0 },
    ])
  })

  it('shows a rename as the delete and the add it commits as', async () => {
    await git('mv', 'kept.txt', 'moved.txt')

    expect(await readChanges(repo)).toEqual([
      { path: 'kept.txt', status: 'D', added: 0, removed: 2 },
      { path: 'moved.txt', status: 'A', added: 2, removed: 0 },
    ])
  })

  it('says it cannot count a binary file rather than guessing', async () => {
    await writeFile(join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255]))

    expect(await readChanges(repo)).toEqual([
      { path: 'blob.bin', status: 'A', added: null, removed: 0 },
    ])
  })
})

describe('proposeMessage', () => {
  it('is empty when nothing changed', () => {
    expect(proposeMessage([])).toBe('')
  })

  it('names the file when there is one', () => {
    expect(proposeMessage([{ path: 'src/one.ts', status: 'M', added: 1, removed: 0 }])).toBe(
      'update src/one.ts',
    )
  })

  it('names the folder they share', () => {
    const message = proposeMessage([
      { path: 'src/sync/one.ts', status: 'M', added: 1, removed: 0 },
      { path: 'src/sync/two.ts', status: 'M', added: 1, removed: 0 },
    ])

    expect(message).toBe('update 2 files in src/sync')
  })

  it('says nothing about a folder when they share none', () => {
    const message = proposeMessage([
      { path: 'one.ts', status: 'M', added: 1, removed: 0 },
      { path: 'docs/two.md', status: 'M', added: 1, removed: 0 },
    ])

    expect(message).toBe('update 2 files')
  })
})

describe('commitAll', () => {
  it('commits everything the card listed', async () => {
    await write('kept.txt', 'one\ntwo\nthree\n')
    await write('new.txt', 'x\n')

    const result = await commitAll(repo, { message: 'fix: bounded retry', push: false })

    expect(result).toEqual({ ok: true, pushed: false })
    expect(await head()).toBe('fix: bounded retry')
    expect(await readChanges(repo)).toEqual([])
  })

  it('refuses an empty message rather than letting git invent one', async () => {
    await write('kept.txt', 'changed\n')

    const result = await commitAll(repo, { message: '   ', push: false })

    expect(result).toEqual({ ok: false, stage: 'commit', reason: 'a commit needs a message' })
    expect(await head()).toBe('first')
  })

  it('reports a commit git refused, and commits nothing', async () => {
    const result = await commitAll(repo, { message: 'nothing to do', push: false })

    expect(result).toMatchObject({ ok: false, stage: 'commit' })
    expect(await head()).toBe('first')
  })

  it('keeps the commit when the push fails, and says which half broke', async () => {
    // A commit that survived a failed push must not be reported as a failed
    // commit: that sends someone looking for work that is already saved.
    await git('remote', 'add', 'origin', join(repo, 'no-such-remote.git'))
    await write('kept.txt', 'one\ntwo\nthree\n')

    const result = await commitAll(repo, { message: 'fix: retry', push: true })

    expect(result).toMatchObject({ ok: false, stage: 'push' })
    expect(await head()).toBe('fix: retry')
  })
})

describe('pushCommits', () => {
  it('reports what git said went wrong, in one line', async () => {
    const result = await pushCommits(repo)

    expect(result).toMatchObject({ ok: false, stage: 'push' })
    if (!result.ok) {
      expect(result.reason).not.toContain('\n')
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })

  it('pushes to a real remote', async () => {
    const remote = await mkdtemp(join(tmpdir(), 'piocarina-remote-'))
    await run('git', ['init', '--bare', '-b', 'main'], { cwd: remote })
    await git('remote', 'add', 'origin', remote)
    await git('push', '-u', 'origin', 'main')
    await write('kept.txt', 'one\ntwo\nthree\n')
    await commitAll(repo, { message: 'second', push: false })

    expect(await pushCommits(repo)).toEqual({ ok: true, pushed: true })

    const { stdout } = await run('git', ['log', '-1', '--pretty=%s', 'main'], { cwd: remote })
    expect(stdout.trim()).toBe('second')
    await rm(remote, { recursive: true, force: true })
  })
})
