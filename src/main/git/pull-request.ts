/** Opening a pull request from a push.
 *
 *  Every git host prints a "create a pull request" link on stderr when a branch
 *  arrives for the first time, and that link is always the right one: the host
 *  knows its own default branch, its own URL shape, and whether the repository
 *  is a fork. Reading what it said beats guessing.
 *
 *  It is not always said, though — a re-push of an existing branch prints
 *  nothing — so there is a second path that builds the URL from the remote. That
 *  one is a guess, and it is kept deliberately shallow: for a host this module
 *  does not recognise it stops at the repository's web root rather than
 *  inventing a path that would 404. The caller has the branch name on the
 *  clipboard either way. */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type PushResult = { ok: true; url: string | null } | { ok: false; reason: string }

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['--no-optional-locks', ...args], {
    cwd,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
  return stdout
}

/** The pull request link a push printed, or null when it printed none.
 *
 *  The wording differs per host — GitHub says "Create a pull request", GitLab
 *  "To create a merge request", Gitea and Bitbucket their own — so this matches
 *  on the URL rather than on the sentence around it, and stays correct for a
 *  host nobody here has seen.
 *
 *  A push also echoes the remote it pushed to, which is a URL and is not a page
 *  anybody can open; a `.git` ending is what tells the two apart. */
export function urlFromPushOutput(output: string): string | null {
  for (const line of output.split('\n')) {
    // The `To <remote>` line is git echoing where it pushed, not a page.
    // Skipping it by shape rather than by a `.git` suffix: a remote cloned
    // without that suffix is echoed bare, and returning it would drop the
    // reader on a repository home page instead of the compare view — with the
    // built-URL fallback, which is the tested path, never reached.
    if (/^\s*To\s/.test(line)) continue

    // Stops at whitespace and at the closing characters a host might wrap a
    // link in; trailing sentence punctuation is trimmed after, because a URL
    // may legitimately end in `)` and only the last character is suspect.
    for (const raw of line.match(/https?:\/\/[^\s<>"'`]+/g) ?? []) {
      const url = raw.replace(/[.,;:)\]}>'"]+$/, '')
      if (url.endsWith('.git')) continue
      const safe = withoutCredentials(url)
      if (safe) return safe
    }
  }
  return null
}

/** The same URL with any embedded credentials removed.
 *
 *  A token pasted into `git remote add` lives in the remote URL forever, and
 *  git echoes that URL back during a push. This string is on its way to a
 *  browser and a clipboard, so it does not carry one. */
function withoutCredentials(url: string): string | null {
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return null
  }
}

/** The "new pull request" page for a branch, worked out from a remote URL.
 *
 *  Null only when the remote is not a git remote at all. An unrecognised host
 *  still gets an answer — its web root — because a page one click from the
 *  right one is more use than nothing. */
export function pullRequestUrl(remote: string, branch: string): string | null {
  const parsed = parseRemote(remote)
  if (!parsed) return null

  const { host, path } = parsed
  const web = `https://${host}/${path}`
  // Branches contain `/` — `fix/OCA-231` is the house style — and a raw slash
  // in a query parameter changes which page the host serves.
  const ref = encodeURIComponent(branch)

  // Matched on a substring, not on equality: self-hosted installations answer
  // to names like `github.acme.internal` and speak the same URL shapes.
  if (host.includes('github')) return `${web}/compare/${ref}?expand=1`
  if (host.includes('gitlab')) return `${web}/-/merge_requests/new?merge_request[source_branch]=${ref}`
  if (host.includes('bitbucket')) return `${web}/pull-requests/new?source=${ref}`
  return web
}

/** Host and `owner/repo` of a remote, in any of the spellings git accepts.
 *
 *  Credentials are dropped from https remotes. They appear there more often than
 *  anyone intends — a token pasted into `git remote add` lives in the URL
 *  forever — and this string is on its way to a browser and a clipboard. */
function parseRemote(remote: string): { host: string; path: string } | null {
  const text = remote.trim()
  if (text === '') return null

  const scheme = text.match(/^(https?|ssh|git):\/\/(.+)$/)
  if (scheme) {
    const rest = scheme[2]
    const slash = rest.indexOf('/')
    if (slash === -1) return null
    // The authority is split off before the credentials are, so an `@` further
    // down the path cannot be mistaken for the end of a username.
    const authority = rest.slice(0, slash)
    const at = authority.lastIndexOf('@')
    return clean(at === -1 ? authority : authority.slice(at + 1), rest.slice(slash + 1), {
      keepPort: scheme[1] === 'http' || scheme[1] === 'https',
    })
  }

  // scp-like: `git@host:owner/repo.git`. The colon is the separator, so a
  // port cannot be spelled here and anything after it is the path.
  const scp = text.match(/^(?:[^@\s/]+@)?([^\s:/]+):(.+)$/)
  if (scp) return clean(scp[1], scp[2])

  return null
}

function clean(
  host: string,
  path: string,
  { keepPort = false }: { keepPort?: boolean } = {},
): { host: string; path: string } | null {
  // An ssh port belongs to the git endpoint, not to the web one:
  // `ssh://git@host:2222` serves pages on 443. An https port is the web one
  // already — a self-hosted forge on `:8443` answers there and nowhere else —
  // so that one is kept. IPv6 literals are left alone either way: they are not
  // hosts this module can build a public page for.
  const bare = (keepPort ? host : host.replace(/:\d+$/, '')).toLowerCase()
  const repo = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '')
  if (bare === '' || repo === '') return null

  return { host: bare, path: repo }
}

/** Pushes a branch and says where its pull request would be opened.
 *
 *  `-u` because the branch is new by construction here, and a branch pushed
 *  without an upstream makes every later `git pull` in that worktree an error
 *  the person has to read git's suggestion to fix.
 *
 *  A missing URL is not a failure. The push happened; only the link is unknown,
 *  and `ok: true` with a null url says exactly that. */
export async function pushBranch(cwd: string, branch: string): Promise<PushResult> {
  let output: string
  try {
    // Both streams: git writes progress and the host's message to stderr, but
    // which of the two carries the link is the host's business, not ours.
    const { stdout, stderr } = await run(
      'git',
      ['--no-optional-locks', 'push', '-u', 'origin', branch],
      { cwd, timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    )
    output = `${stdout}\n${stderr}`
  } catch (error) {
    return { ok: false, reason: reasonFrom(error) }
  }

  const printed = urlFromPushOutput(output)
  if (printed) return { ok: true, url: printed }

  // No remote to read is not an error worth surfacing: the push already
  // succeeded, so a repository whose origin has since gone just gets no link.
  const remote = await git(cwd, ['remote', 'get-url', 'origin']).catch(() => '')
  return { ok: true, url: pullRequestUrl(remote.trim(), branch) }
}

/** git's own complaint, one line of it.
 *
 *  git narrates on stderr as well as failing on it — a push prints its
 *  "Enumerating objects" progress there before saying why it stopped — so the
 *  first line is rarely the reason. The first `fatal:` or `error:` line is. */
function reasonFrom(error: unknown): string {
  const said = error as { stderr?: string; message?: string }
  const stderr = said.stderr?.trim()
  if (stderr) {
    const lines = stderr.split('\n').filter((line) => line.trim().length > 0)
    const blamed =
      lines.find((line) => /^(fatal|error):/.test(line.trim())) ?? lines[lines.length - 1]
    return blamed.trim().replace(/^(fatal|error):\s*/, '')
  }
  return said.message ?? 'git push failed'
}
