/** Worktrees: a thread that edits its own copy of the repository.
 *
 *  Many threads run at once, and they all write to one working copy. Two of
 *  them editing is not parallel work; it is one working copy with two authors
 *  and no lock. A worktree gives a thread its own directory and its own branch,
 *  and git keeps the object store shared, so the cost is a checkout rather than
 *  a clone.
 *
 *  They live inside the repository, under `.ocarina/worktrees`, so a reader can
 *  find them without knowing where an app hid its state. That has one price:
 *  the directory is untracked, and would show up in the workspace's own status
 *  as a thousand new files. `.ocarina/` goes into the repository's
 *  `info/exclude` — which is per-clone and never committed, so this writes it
 *  the first time it makes a worktree, rather than assuming it is there. */

import { execFile } from 'node:child_process'
import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { worktreeDirName } from '../../shared/branch-name'

const run = promisify(execFile)

/** The line written into `info/exclude`. The whole directory, not just the
 *  worktrees under it: everything this app writes into a repository lives
 *  there, and a reader who deletes the line means to see all of it. */
const EXCLUDE_LINE = '.ocarina/'

export interface Worktree {
  /** Absolute path of the checkout. */
  path: string
  /** Branch it is on, or null when it is detached. */
  branch: string | null
}

export interface WorktreeState {
  /** Files changed and not committed. */
  dirty: number
  /** Commits on this branch and nowhere else. The work that removing the
   *  worktree would throw away. */
  commits: number
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['--no-optional-locks', ...args], {
    cwd,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
  return stdout
}

/** Where this repository keeps its worktrees. */
export function worktreeRoot(repo: string): string {
  return join(repo, '.ocarina', 'worktrees')
}

/** Adds a worktree on a new branch, and returns where it is.
 *
 *  Throws git's own message when the branch or the directory is taken. The
 *  caller shows it; inventing a free name here would put a thread on a branch
 *  nobody asked for. */
export async function addWorktree(repo: string, branch: string): Promise<string> {
  const path = join(worktreeRoot(repo), worktreeDirName(branch))
  await mkdir(worktreeRoot(repo), { recursive: true })
  await excludeOcarina(repo)

  try {
    await git(repo, ['worktree', 'add', '-b', branch, path])
  } catch (error) {
    throw new Error(reasonFrom(error))
  }
  return path
}

/** Every worktree of this repository, the main one included. */
export async function listWorktrees(repo: string): Promise<Worktree[]> {
  const stdout = await git(repo, ['worktree', 'list', '--porcelain']).catch(() => '')

  const trees: Worktree[] = []
  let path: string | null = null
  let branch: string | null = null

  const flush = (): void => {
    if (path !== null) trees.push({ path, branch })
    path = null
    branch = null
  }

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      path = line.slice('worktree '.length)
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch refs/heads/'.length)
    }
  }
  flush()

  return trees
}

/** Removes a worktree. Its branch is left alone: the branch is where the
 *  commits are, and this call is about the checkout. */
export async function removeWorktree(
  repo: string,
  path: string,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  try {
    await git(repo, ['worktree', 'remove', ...(force ? ['--force'] : []), path])
  } catch (error) {
    throw new Error(reasonFrom(error))
  }
}

/** What removing this worktree would cost.
 *
 *  `commits` counts what is reachable from its HEAD and from no other branch —
 *  which is the honest question, and does not need the base branch to have been
 *  written down when the worktree was made. A worktree whose branch was merged
 *  elsewhere therefore reports zero, correctly: nothing would be lost. */
export async function worktreeState(path: string): Promise<WorktreeState> {
  const [status, commits] = await Promise.all([
    git(path, ['status', '--porcelain']).catch(() => ''),
    countOwnCommits(path),
  ])

  return {
    dirty: status.split('\n').filter((line) => line.length > 0).length,
    commits,
  }
}

async function countOwnCommits(path: string): Promise<number> {
  const branch = (await git(path, ['branch', '--show-current']).catch(() => '')).trim()
  // Detached, or a branch with no name to exclude: every commit reachable from
  // another branch is excluded, so this is still not a count of the repository.
  // The pattern is relative to what it excludes from: with `--branches`, git
  // matches under `refs/heads/`, and a pattern spelled with that prefix
  // silently matches nothing — a worktree with commits then reports none.
  const exclude = branch === '' ? [] : [`--exclude=${branch}`]

  const stdout = await git(path, [
    'rev-list',
    '--count',
    'HEAD',
    '--not',
    ...exclude,
    '--branches',
    '--remotes',
  ]).catch(() => '0')

  const count = Number.parseInt(stdout.trim(), 10)
  return Number.isFinite(count) ? count : 0
}

/** Writes `.ocarina/` into the repository's `info/exclude`, once.
 *
 *  `--git-common-dir` rather than `<repo>/.git`: called from inside a worktree,
 *  `.git` is a file pointing elsewhere, and the exclude that matters is the one
 *  every worktree of the repository shares. */
async function excludeOcarina(repo: string): Promise<void> {
  let dir: string
  try {
    dir = (await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
  } catch {
    return
  }
  if (dir === '') return

  const file = join(dir, 'info', 'exclude')
  const body = await readFile(file, 'utf8').catch(() => null)
  if (body !== null && body.split('\n').some((line) => line.trim() === EXCLUDE_LINE)) return

  await mkdir(join(dir, 'info'), { recursive: true })
  const lead = body === null || body.endsWith('\n') || body === '' ? '' : '\n'
  await appendFile(file, `${lead}${EXCLUDE_LINE}\n`, 'utf8')
}

/** git's own complaint, which is more use to a reader than any sentence this
 *  module could write about it. */
function reasonFrom(error: unknown): string {
  const said = error as { stderr?: string; message?: string }
  const stderr = said.stderr?.trim()
  if (stderr) {
    // git narrates on stderr as well as failing on it: `worktree add` prints
    // "Preparing worktree..." before "fatal: a branch named ... already
    // exists". The first line is the narration; the reason is the fatal one.
    const lines = stderr.split('\n').filter((line) => line.trim().length > 0)
    const fatal = lines.find((line) => line.startsWith('fatal: ')) ?? lines[lines.length - 1]
    return fatal.replace(/^fatal: /, '')
  }
  return said.message ?? 'git failed'
}
