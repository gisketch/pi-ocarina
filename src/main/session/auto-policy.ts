/** What `auto` lets through without asking.
 *
 *  A written rule rather than a classifier. A second model before every shell
 *  command costs a round-trip on a tool whose point is that the turn does not
 *  stall, and a policy the reader cannot predict makes an arriving prompt feel
 *  random — which is the thing the level exists to fix.
 *
 *  Everything here fails closed. A command this cannot parse is a command the
 *  reader is asked about. */

import { isAbsolute, join, resolve } from 'node:path'
import { FETCH_TOOL } from './fetch-tool'
import { isWriteMethod } from '../web/fetch-page'

/** Never written without asking, wherever they are.
 *
 *  `.git` is the repository's own state and a corrupt one costs work that is
 *  not in any file. The rest hold credentials or this app's own configuration.
 *  Taken from what Claude Code protects, for the same reason it does. */
const PROTECTED = ['.git', '.env', '.ssh', '.pi', '.ocarina']

/** Whether a path is, or is inside, something protected.
 *
 *  Segment by segment, never by prefix: `.gitignore` starts with `.git` and is
 *  an ordinary file, and `.env.example` is not a secret — but `.env.local` is,
 *  so a segment counts when it equals a protected name or begins with one
 *  followed by a dot. */
export function isProtectedPath(full: string): boolean {
  return full.split('/').some((segment) => {
    for (const name of PROTECTED) {
      if (segment === name) return true
      if (name === '.env' && segment.startsWith('.env.')) return true
    }
    return false
  })
}

/** A path resolved against the workspace, or null when it leaves it.
 *
 *  Resolved on both branches: an absolute path taken as written keeps its `..`
 *  segments, and `/repo/../secret` would pass a prefix test against `/repo`. */
export function insideWorkspace(path: string, cwd: string): string | null {
  const full = resolve(isAbsolute(path) ? path : join(cwd, path))
  const root = resolve(cwd)
  return full === root || full.startsWith(`${root}/`) ? full : null
}

/** Anything that expands to something unknowable before it runs. */
const SUBSTITUTION = /\$\(|`|<\(|\$\{/

/** Splits a command into the parts that each have to pass on their own. A
 *  compound command is as dangerous as its worst segment. */
export function segmentsOf(command: string): string[] {
  return command
    .split(/&&|\|\||[;|]/)
    .map((one) => one.trim())
    .filter((one) => one !== '')
}

/** Commands `auto` always asks about, matched on the segment's opening words.
 *
 *  A deny-list, and deny-lists are always incomplete — this one is paired with
 *  the scope check below and a parser that gives up loudly, which is what makes
 *  it credible rather than decorative. */
const STOP: readonly RegExp[] = [
  /^sudo\b/,
  /^doas\b/,
  /^rm\b.*\s-\w*[rf]/,
  /^rmdir\b/,
  /^chmod\b/,
  /^chown\b/,
  /^git\s+push\b/,
  /^git\s+reset\b.*--hard/,
  /^git\s+clean\b/,
  /^npm\s+publish\b/,
  /^pnpm\s+publish\b/,
  /^yarn\s+publish\b/,
  /^cargo\s+publish\b/,
  /^dotnet\s+nuget\s+push\b/,
  /^docker\b.*\s(-H|--context)\b/,
  /^(curl|wget)\b/,
  /^(shutdown|reboot|kill|killall|pkill)\b/,
  /^:\(\)/,
]

/** Whether a segment writes somewhere outside the workspace.
 *
 *  Only arguments that look like paths are checked: a flag is not a path, and
 *  treating every word as one would ask about `pnpm test`. A redirect target is
 *  always checked, because that is the one argument whose whole job is to be
 *  written to. */
function staysInside(segment: string, cwd: string): boolean {
  const redirects = segment.matchAll(/>>?\s*(\S+)/g)
  for (const [, target] of redirects) {
    if (target !== '/dev/null' && !insideWorkspace(target, cwd)) return false
  }

  for (const word of segment.split(/\s+/)) {
    if (word.startsWith('-')) continue
    if (!word.startsWith('/') && !word.startsWith('~') && !word.startsWith('..')) continue
    if (word.startsWith('~')) return false
    if (!insideWorkspace(word, cwd)) return false
  }
  return true
}

/** Whether `auto` runs this command without asking. */
export function autoAllowsCommand(command: string, cwd: string): boolean {
  const text = command.trim()
  if (text === '' || SUBSTITUTION.test(text)) return false

  const segments = segmentsOf(text)
  if (segments.length === 0) return false

  return segments.every(
    (segment) => !STOP.some((stop) => stop.test(segment)) && staysInside(segment, cwd),
  )
}

/** Whether `auto` runs this call without asking.
 *
 *  Only ever consulted for calls the gate already decided are worth gating, so
 *  a tool this does not recognise is one that changes something in a way this
 *  rule cannot judge — and is asked about. */
export function autoAllows(toolName: string, input: unknown, cwd: string): boolean {
  const record = (input ?? {}) as Record<string, unknown>
  const pick = (key: string): string | undefined =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined

  if (toolName === FETCH_TOOL) {
    // A write method reaches a server this app does not own, and no scope check
    // here says anything about what happens there.
    return !isWriteMethod(pick('method') ?? 'GET')
  }

  if (toolName === 'bash') {
    const command = pick('command')
    return command === undefined ? false : autoAllowsCommand(command, cwd)
  }

  if (toolName === 'write' || toolName === 'edit') {
    const path = pick('path') ?? pick('file_path')
    if (path === undefined) return false
    const full = insideWorkspace(path, cwd)
    return full !== null && !isProtectedPath(full)
  }

  return false
}
