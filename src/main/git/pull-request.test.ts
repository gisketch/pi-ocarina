import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pullRequestUrl, pushBranch, urlFromPushOutput } from './pull-request'

const run = promisify(execFile)

describe('urlFromPushOutput', () => {
  it('reads the link GitHub prints', () => {
    const output = [
      'remote: ',
      "remote: Create a pull request for 'feat/x' on GitHub by visiting:",
      'remote:      https://github.com/o/r/pull/new/feat/x',
      'remote: ',
      'To https://github.com/o/r.git',
      ' * [new branch]      feat/x -> feat/x',
    ].join('\n')

    expect(urlFromPushOutput(output)).toBe('https://github.com/o/r/pull/new/feat/x')
  })

  it('reads the link GitLab prints, query string and all', () => {
    const output = [
      'remote: To create a merge request for feat/x, visit:',
      'remote:   https://gitlab.com/o/r/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fx',
    ].join('\n')

    expect(urlFromPushOutput(output)).toBe(
      'https://gitlab.com/o/r/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fx',
    )
  })

  it('reads the link Gitea prints', () => {
    const output = [
      'remote: Create a new pull request for \'feat/x\':',
      'remote:   https://gitea.example.com/o/r/compare/main...feat/x',
      'To git@gitea.example.com:o/r.git',
    ].join('\n')

    expect(urlFromPushOutput(output)).toBe('https://gitea.example.com/o/r/compare/main...feat/x')
  })

  it('reads the link Bitbucket prints', () => {
    const output = [
      'remote: Create pull request for feat/x:',
      'remote:   https://bitbucket.org/o/r/pull-requests/new?source=feat/x&t=1',
    ].join('\n')

    expect(urlFromPushOutput(output)).toBe(
      'https://bitbucket.org/o/r/pull-requests/new?source=feat/x&t=1',
    )
  })

  it('ignores the remote the push echoes back', () => {
    const output = ['To https://github.com/o/r.git', '   abc1234..def5678  main -> main'].join('\n')

    expect(urlFromPushOutput(output)).toBeNull()
  })

  it('says nothing when nothing was printed', () => {
    expect(urlFromPushOutput('Everything up-to-date\n')).toBeNull()
    expect(urlFromPushOutput('')).toBeNull()
  })
})

describe('pullRequestUrl', () => {
  it('builds a compare page for github, from any spelling of the remote', () => {
    const wanted = 'https://github.com/o/r/compare/main?expand=1'

    expect(pullRequestUrl('git@github.com:o/r.git', 'main')).toBe(wanted)
    expect(pullRequestUrl('git@github.com:o/r', 'main')).toBe(wanted)
    expect(pullRequestUrl('ssh://git@github.com/o/r.git', 'main')).toBe(wanted)
    expect(pullRequestUrl('https://github.com/o/r.git', 'main')).toBe(wanted)
    expect(pullRequestUrl('https://github.com/o/r', 'main')).toBe(wanted)
  })

  it('recognises a self-hosted github by its host name', () => {
    expect(pullRequestUrl('git@github.acme.internal:o/r.git', 'main')).toBe(
      'https://github.acme.internal/o/r/compare/main?expand=1',
    )
  })

  it('builds a merge request page for gitlab', () => {
    expect(pullRequestUrl('git@gitlab.com:o/r.git', 'main')).toBe(
      'https://gitlab.com/o/r/-/merge_requests/new?merge_request[source_branch]=main',
    )
  })

  it('builds a pull request page for bitbucket', () => {
    expect(pullRequestUrl('https://bitbucket.org/o/r.git', 'main')).toBe(
      'https://bitbucket.org/o/r/pull-requests/new?source=main',
    )
  })

  it('stops at the web root for a host it does not know', () => {
    expect(pullRequestUrl('git@git.example.com:o/r.git', 'feat/x')).toBe(
      'https://git.example.com/o/r',
    )
  })

  it('encodes a branch with a slash in it', () => {
    expect(pullRequestUrl('git@github.com:o/r.git', 'fix/OCA-231')).toBe(
      'https://github.com/o/r/compare/fix%2FOCA-231?expand=1',
    )
    expect(pullRequestUrl('git@gitlab.com:o/r.git', 'fix/OCA-231')).toBe(
      'https://gitlab.com/o/r/-/merge_requests/new?merge_request[source_branch]=fix%2FOCA-231',
    )
  })

  it('drops credentials and ssh ports', () => {
    expect(pullRequestUrl('https://user:token@github.com/o/r.git', 'main')).toBe(
      'https://github.com/o/r/compare/main?expand=1',
    )
    expect(pullRequestUrl('ssh://git@github.com:2222/o/r.git', 'main')).toBe(
      'https://github.com/o/r/compare/main?expand=1',
    )
  })

  it('keeps a nested group path, which gitlab has and github does not', () => {
    expect(pullRequestUrl('git@gitlab.com:group/sub/r.git', 'main')).toBe(
      'https://gitlab.com/group/sub/r/-/merge_requests/new?merge_request[source_branch]=main',
    )
  })

  it('says nothing when the remote is not one', () => {
    expect(pullRequestUrl('', 'main')).toBeNull()
    expect(pullRequestUrl('   ', 'main')).toBeNull()
    expect(pullRequestUrl('not a remote at all', 'main')).toBeNull()
    expect(pullRequestUrl('https://github.com', 'main')).toBeNull()
  })
})

/** Against a real repository, and one that has nowhere to push: the claim is
 *  that a missing origin comes back as a reason rather than as a throw. */
describe('pushBranch', () => {
  let repo: string

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'piocarina-pullrequest-'))
    await run('git', ['init', '-b', 'main'], { cwd: repo })
    await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
    await run('git', ['config', 'user.name', 'Test'], { cwd: repo })
    await mkdir(repo, { recursive: true })
    await writeFile(join(repo, 'kept.txt'), 'one\n', 'utf8')
    await run('git', ['add', '-A'], { cwd: repo })
    await run('git', ['commit', '-m', 'first'], { cwd: repo })
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  it('reports a repository with no origin instead of throwing', async () => {
    const result = await pushBranch(repo, 'main')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/origin/)
    expect(result.reason).not.toMatch(/^fatal:/)
  })
})

describe('a self-hosted forge on its own port', () => {
  it('keeps an https port, which is the web port', () => {
    expect(pullRequestUrl('https://git.acme:8443/team/app.git', 'wip')).toBe(
      'https://git.acme:8443/team/app',
    )
  })

  it('drops an ssh port, which is not', () => {
    expect(pullRequestUrl('ssh://git@git.acme:2222/team/app.git', 'wip')).toBe(
      'https://git.acme/team/app',
    )
  })
})

describe('what a push echoes back', () => {
  it('is not mistaken for a page when the remote has no .git', () => {
    const output = 'To https://github.com/o/r\n   abc..def  fix/x -> fix/x\n'

    expect(urlFromPushOutput(output)).toBeNull()
  })

  it('never carries a credential out of the remote', () => {
    const output = 'remote: Create a pull request:\nremote:   https://user:token@github.com/o/r/pull/new/x\n'

    expect(urlFromPushOutput(output)).toBe('https://github.com/o/r/pull/new/x')
  })
})
