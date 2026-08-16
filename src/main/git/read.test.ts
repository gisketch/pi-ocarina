import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readStatus } from './service'

const run = promisify(execFile)

/** Against real git, because the parse is only worth anything if the format it
 *  parses is the format the installed git prints. */
let repo: string

async function git(...args: string[]): Promise<void> {
  await run('git', args, { cwd: repo })
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'piocarina-repo-'))
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('readStatus', () => {
  it('returns null for a folder that is not a repository', async () => {
    expect(await readStatus(repo)).toBeNull()
  })

  it('returns null for a folder that does not exist', async () => {
    expect(await readStatus(join(repo, 'nowhere'))).toBeNull()
  })

  it('reads a real repository the way the chrome needs it', async () => {
    await git('init', '-b', 'main')
    await git('config', 'user.email', 'test@example.com')
    await git('config', 'user.name', 'Test')
    await writeFile(join(repo, 'kept.txt'), 'one\n', 'utf8')
    await git('add', '.')
    await git('commit', '-m', 'first')

    expect(await readStatus(repo)).toMatchObject({
      branch: 'main',
      detached: false,
      added: 0,
      modified: 0,
      untracked: 0,
    })

    await writeFile(join(repo, 'kept.txt'), 'two\n', 'utf8')
    await writeFile(join(repo, 'new.txt'), 'three\n', 'utf8')

    expect(await readStatus(repo)).toMatchObject({
      branch: 'main',
      modified: 1,
      untracked: 1,
    })
  })
})
