import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitChange, GitCommitResult } from '../../shared/protocol'

const run = promisify(execFile)

/** How many untracked files are measured individually.
 *
 *  Each one costs a `git diff` of its own. A change set larger than this is
 *  already too big to read in a card, and the remainder is shown without
 *  counts rather than paid for. */
const MEASURE_LIMIT = 50

/** Runs git and returns stdout, or throws with what git said went wrong. */
async function git(cwd: string, args: string[]): Promise<string> {
  // `core.quotepath=false` keeps non-ASCII paths readable instead of escaped
  // into octal, which the card would then show as gibberish.
  const { stdout } = await run('git', ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
    cwd,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
  return stdout
}

/** What the commit card lists: every file that would go into the commit.
 *
 *  "Would go in" is the whole set — staged, unstaged and untracked — because
 *  committing from the card stages everything it showed. A card that listed
 *  one set and committed another would be worse than no card. */
export async function readChanges(cwd: string): Promise<GitChange[]> {
  const [tracked, untracked] = await Promise.all([
    trackedChanges(cwd),
    untrackedPaths(cwd),
  ])

  const measured = await Promise.all(
    untracked.slice(0, MEASURE_LIMIT).map(async (path) => ({
      path,
      status: 'A' as const,
      ...(await measureNew(cwd, path)),
    })),
  )
  const rest = untracked.slice(MEASURE_LIMIT).map((path) => ({
    path,
    status: 'A' as const,
    added: null,
    removed: null,
  }))

  return [...tracked, ...measured, ...rest].sort((a, b) => a.path.localeCompare(b.path))
}

/** Everything git already tracks, against HEAD, so a staged file and an edited
 *  one appear once with their combined counts.
 *
 *  Two reads, because neither answers alone: `--numstat` counts lines but
 *  cannot tell a deleted file from one whose every line was removed, and
 *  `--name-status` names the change but counts nothing. */
async function trackedChanges(cwd: string): Promise<GitChange[]> {
  // `HEAD` fails in a repository with no commits yet; there the whole tree is
  // untracked, and the untracked pass below covers it.
  const [numstat, nameStatus] = await Promise.all([
    // `--no-renames` on both: with rename detection on, numstat writes one
    // row as `old => new`, which no name-status key can match. Split, the two
    // rows say the same thing and both agree on their paths.
    git(cwd, ['diff', '--numstat', '--no-renames', 'HEAD']).catch(() => ''),
    git(cwd, ['diff', '--name-status', '--no-renames', 'HEAD']).catch(() => ''),
  ])

  const letters = readNameStatus(nameStatus)
  return lines(numstat)
    .map(parseNumstat)
    .filter((change): change is GitChange => change !== null)
    .map((change) => ({ ...change, status: letters.get(change.path) ?? change.status }))
}

function lines(stdout: string): string[] {
  return stdout.split('\n').filter((line) => line.length > 0)
}

/** `<letter>\t<path>`. Only the three letters the card draws are kept;
 *  anything else stays a modification, which is what every other change is
 *  from the card's point of view. */
function readNameStatus(stdout: string): Map<string, GitChange['status']> {
  const letters = new Map<string, GitChange['status']>()

  for (const line of lines(stdout)) {
    const parts = line.split('\t')
    const letter = parts[0]?.[0]
    const path = parts[parts.length - 1]
    if (!path) continue
    letters.set(path, letter === 'A' || letter === 'D' ? letter : 'M')
  }

  return letters
}

/** `<added>\t<removed>\t<path>`, where `-` in a count means a binary file. */
function parseNumstat(line: string): GitChange | null {
  const [added, removed, ...path] = line.split('\t')
  const file = path.join('\t')
  if (!file) return null

  return { path: file, status: 'M', added: count(added), removed: count(removed) }
}

function count(token: string | undefined): number | null {
  const value = Number.parseInt(token ?? '', 10)
  return Number.isFinite(value) ? value : null
}

async function untrackedPaths(cwd: string): Promise<string[]> {
  const stdout = await git(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]).catch(() => '')

  return lines(stdout)
}

/** How big a file git has never seen is.
 *
 *  `--no-index` compares two paths outside the index, which is the only way to
 *  count a file that is not in it. It exits non-zero when the files differ —
 *  which is always, here — so the output is read from the error too. */
async function measureNew(
  cwd: string,
  path: string,
): Promise<{ added: number | null; removed: number | null }> {
  const stdout = await git(cwd, ['diff', '--numstat', '--no-index', '--', '/dev/null', path]).catch(
    (error: { stdout?: string }) => error.stdout ?? '',
  )

  const change = lines(stdout).map(parseNumstat)[0]
  return { added: change?.added ?? null, removed: 0 }
}

/** Whether the repository has a remote at all.
 *
 *  Asked with the change list rather than at the push, because a reader who is
 *  about to commit should be told that pushing is unavailable while they can
 *  still do something about it. */
export async function hasRemote(cwd: string): Promise<boolean> {
  const stdout = await git(cwd, ['remote']).catch(() => '')
  return lines(stdout).length > 0
}

/** A starting point for the message, built from the change set.
 *
 *  Deliberately plain. It is a scaffold the person edits, not a claim about
 *  what the change means — only they know that, and a confident-sounding
 *  invention would be harder to correct than an obviously blank one. */
export function proposeMessage(changes: readonly GitChange[]): string {
  if (changes.length === 0) return ''
  if (changes.length === 1) return `update ${changes[0].path}`

  const folder = commonFolder(changes.map((change) => change.path))
  return folder ? `update ${changes.length} files in ${folder}` : `update ${changes.length} files`
}

function commonFolder(paths: readonly string[]): string {
  const parts = paths.map((path) => path.split('/').slice(0, -1))
  const [first = [], ...rest] = parts

  const shared: string[] = []
  for (const [index, segment] of first.entries()) {
    if (!rest.every((other) => other[index] === segment)) break
    shared.push(segment)
  }
  return shared.join('/')
}

/** Commits what the card listed, and pushes if asked.
 *
 *  Commits exactly the paths the card listed, and nothing else. Never called
 *  on its own: the card exists so that a person presses the key.
 *  Push is reported separately from commit because the commit survives a failed
 *  push, and telling someone their commit failed when it did not would send
 *  them looking for work that is already saved. */
export async function commitAll(
  cwd: string,
  { message, paths, push }: { message: string; paths: readonly string[]; push: boolean },
): Promise<GitCommitResult> {
  if (message.trim().length === 0) {
    return { ok: false, stage: 'commit', reason: 'a commit needs a message' }
  }
  if (paths.length === 0) {
    return { ok: false, stage: 'commit', reason: 'nothing was listed to commit' }
  }

  try {
    // Only the paths the card listed. `add -A` with no pathspec would sweep in
    // whatever was written between the card opening and the key being pressed
    // — and in this app an agent may well be editing that folder right now.
    // `-A` still applies to those paths, so a listed deletion is staged too.
    await git(cwd, ['add', '-A', '--', ...paths])
    // Scoped to the same paths, so a commit cannot carry something staged
    // outside the card either.
    await git(cwd, ['commit', '-m', message, '--only', '--', ...paths])
  } catch (error) {
    return { ok: false, stage: 'commit', reason: reasonFrom(error) }
  }

  if (!push) return { ok: true, pushed: false }
  return pushCommits(cwd)
}

/** Pushes what is already committed. Its own command so a failed push can be
 *  retried without committing a second time. */
export async function pushCommits(cwd: string): Promise<GitCommitResult> {
  try {
    await git(cwd, ['push'])
    return { ok: true, pushed: true }
  } catch (error) {
    return { ok: false, stage: 'push', reason: reasonFrom(error) }
  }
}

/** What git said, in one line. git puts the useful sentence on stderr and
 *  wraps it in hints; the first non-empty line is the part worth showing. */
function reasonFrom(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr ?? ''
  const line = stderr.split('\n').find((candidate) => candidate.trim().length > 0)
  if (line) return line.trim().replace(/^(error|fatal):\s*/, '')

  return error instanceof Error ? error.message : String(error)
}
