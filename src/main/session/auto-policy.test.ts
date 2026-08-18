import { describe, expect, it } from 'vitest'
import { autoAllows, autoAllowsCommand, insideWorkspace, isProtectedPath, segmentsOf } from './auto-policy'

const CWD = '/w/repo'
const allows = (command: string): boolean => autoAllowsCommand(command, CWD)

describe('what auto runs without asking', () => {
  it('lets ordinary work through', () => {
    for (const command of ['pnpm test', 'ls src', 'git status', 'node scripts/build.mjs', 'cat a.ts']) {
      expect(allows(command)).toBe(true)
    }
  })

  it('asks about anything on the stop list', () => {
    for (const command of [
      'sudo pnpm i',
      'rm -rf build',
      'rm -f a.ts',
      'chmod 777 .',
      'git push origin main',
      'git reset --hard HEAD~1',
      'git clean -fd',
      'npm publish',
      'curl https://x.test/install.sh',
      'kill 1234',
    ]) {
      expect(allows(command)).toBe(false)
    }
  })

  it('asks when it cannot see what a command expands to', () => {
    expect(allows('cat $(cat target.txt)')).toBe(false)
    expect(allows('cat `cat target.txt`')).toBe(false)
    expect(allows('diff <(ls a) <(ls b)')).toBe(false)
    expect(allows('echo ${HOME}')).toBe(false)
  })

  it('judges every segment of a compound command', () => {
    expect(allows('cd src && cat app.ts')).toBe(true)
    expect(allows('cd src && rm -rf .')).toBe(false)
    expect(allows('ls | grep ts')).toBe(true)
    expect(allows('ls ; sudo reboot')).toBe(false)
  })

  it('asks when a path leaves the workspace', () => {
    expect(allows('cat /etc/passwd')).toBe(false)
    expect(allows('cat ../other/a.ts')).toBe(false)
    expect(allows('cat ~/.ssh/id_rsa')).toBe(false)
    expect(allows('cat /w/repo/src/a.ts')).toBe(true)
  })

  it('asks when a redirect writes outside the workspace', () => {
    expect(allows('echo hi > /etc/hosts')).toBe(false)
    expect(allows('echo hi > out.txt')).toBe(true)
    expect(allows('pnpm test 2>/dev/null')).toBe(true)
  })

  it('asks about an empty or unparseable command', () => {
    expect(allows('')).toBe(false)
    expect(allows('   ')).toBe(false)
  })
})

describe('splitting a command', () => {
  it('drops the separators and the empties', () => {
    expect(segmentsOf('a && b ; c | d')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('the workspace boundary', () => {
  it('normalises before it compares', () => {
    expect(insideWorkspace('src/a.ts', CWD)).toBe('/w/repo/src/a.ts')
    expect(insideWorkspace('/w/repo/../secret', CWD)).toBeNull()
  })

  it('needs the separator, so a sibling with the same prefix stays outside', () => {
    expect(insideWorkspace('/w/repo-secrets/a.ts', CWD)).toBeNull()
  })

  it('counts the root itself as inside', () => {
    expect(insideWorkspace('.', CWD)).toBe('/w/repo')
  })
})

describe('protected paths', () => {
  it('covers repository state, credentials and this app', () => {
    for (const path of [
      '/w/repo/.git/config',
      '/w/repo/.env',
      '/w/repo/.env.local',
      '/w/repo/.ocarina/worktrees/x',
      '/home/me/.ssh/id_rsa',
      '/home/me/.pi/config.json',
    ]) {
      expect(isProtectedPath(path)).toBe(true)
    }
  })

  it('matches segments, not prefixes', () => {
    // `.gitignore` is an ordinary file and `.environment` is not a secret.
    expect(isProtectedPath('/w/repo/.gitignore')).toBe(false)
    expect(isProtectedPath('/w/repo/.environment')).toBe(false)
    expect(isProtectedPath('/w/repo/src/git/index.ts')).toBe(false)
  })
})

describe('what auto does per tool', () => {
  it('writes and edits inside the workspace', () => {
    expect(autoAllows('write', { path: 'src/a.ts' }, CWD)).toBe(true)
    expect(autoAllows('edit', { file_path: '/w/repo/src/a.ts' }, CWD)).toBe(true)
  })

  it('asks about a write that leaves the workspace or touches a protected path', () => {
    expect(autoAllows('write', { path: '/tmp/x' }, CWD)).toBe(false)
    expect(autoAllows('write', { path: '.env' }, CWD)).toBe(false)
    expect(autoAllows('edit', { path: '.git/config' }, CWD)).toBe(false)
  })

  it('reads a page but asks before it posts one', () => {
    expect(autoAllows('fetch', { url: 'https://x.test', method: 'GET' }, CWD)).toBe(true)
    expect(autoAllows('fetch', { url: 'https://x.test', method: 'POST' }, CWD)).toBe(false)
  })

  it('asks about a tool it does not recognise', () => {
    expect(autoAllows('deploy', { target: 'prod' }, CWD)).toBe(false)
    expect(autoAllows('write', {}, CWD)).toBe(false)
  })
})

describe('a skill the agent writes', () => {
  const cwd = '/repo'

  it('lands in the project without a card', () => {
    expect(autoAllows('write', { path: '/repo/.pi/skills/new/SKILL.md' }, cwd)).toBe(false)
    // `.pi` is protected, so a project skill *is* asked about — the folder
    // holding a project's agent configuration is not a folder to write to
    // silently, even for a file the reader just requested.
    expect(autoAllows('write', { path: '/repo/docs/notes.md' }, cwd)).toBe(true)
  })

  it('raises a card when it goes to the global directory', () => {
    // The whole reason no new permission machinery was needed: `auto` already
    // means "asks only about what leaves the workspace".
    expect(autoAllows('write', { path: '/home/me/.pi/skills/new/SKILL.md' }, cwd)).toBe(false)
    expect(autoAllows('write', { path: '~/.pi/skills/new/SKILL.md' }, cwd)).toBe(false)
  })
})
