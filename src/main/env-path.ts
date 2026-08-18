/** The PATH this app searches for language servers and other tools.
 *
 *  An Electron app started from Finder or the dock inherits launchd's
 *  environment, which is `/usr/bin:/bin:/usr/sbin:/sbin` and nothing else. None
 *  of the places a developer actually installs tools are in it: not
 *  `~/.dotnet/tools`, not a global npm prefix, not nvm's current version. The
 *  reader had installed `csharp-ls` exactly as we told them to and the settings
 *  screen still said it was missing, because we were looking at a PATH their
 *  shell had never touched.
 *
 *  Telling them to edit a shell file is the wrong contract for a GUI app — the
 *  file they edit is read by shells, and this is not one. So the app asks their
 *  login shell what PATH it has, once, and works from that instead.
 *
 *  This matters twice: detection reads PATH to decide whether a server exists,
 *  and the spawn that starts it resolves the same bare command name. They have
 *  to agree, or the settings screen offers a server that cannot start. */

import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Where the ecosystems install user-level tools.
 *
 *  A fallback, not the mechanism. It covers the case where the login shell is
 *  itself misconfigured, and it costs nothing: a directory that does not exist
 *  contributes no executables to a PATH search. */
const TOOL_DIRS = [
  ['.dotnet', 'tools'],
  ['.npm-global', 'bin'],
  ['.local', 'bin'],
  ['go', 'bin'],
  ['.cargo', 'bin'],
  ['.bun', 'bin'],
]

export function toolDirs(home: string = homedir()): string[] {
  return TOOL_DIRS.map((parts) => join(home, ...parts))
}

/** Marks where the shell's answer begins.
 *
 *  A login interactive shell runs the reader's startup files, and those files
 *  print things — version notices, a greeting, whatever they have. Reading the
 *  tail of stdout would sometimes read one of those. The value is whatever
 *  follows the last marker, so anything printed before it is discarded. */
const MARK = '__ocarina_path__'

/** How long the login shell gets. Startup files can be slow, but not this
 *  slow, and a shell that hangs must not hold the app's boot. */
export const SHELL_TIMEOUT = 3000

export type RunShell = (shell: string) => Promise<string>

const runLoginShell: RunShell = (shell) =>
  new Promise((resolve) => {
    // `-l` reads the login files, `-i` reads the interactive ones. Both,
    // because which file a reader put their export in is their business:
    // `.zprofile` is login-only and `.zshrc` is interactive-only, and the one
    // we skipped is always the one they used.
    execFile(
      shell,
      ['-lic', `printf %s ${MARK}"$PATH"`],
      { timeout: SHELL_TIMEOUT, encoding: 'utf8' },
      (_error, stdout) => resolve(stdout ?? ''),
    )
  })

/** The PATH inside a shell's reply, or null when there is no reply to read. */
export function parseShellPath(stdout: string): string | null {
  const at = stdout.lastIndexOf(MARK)
  if (at === -1) return null
  const value = stdout.slice(at + MARK.length).trim()
  return value === '' ? null : value
}

/** One PATH from several, in order, without repeats.
 *
 *  The current PATH stays in front. Whatever launched this app chose it, and a
 *  reader who put a wrapper early in their PATH meant it. */
export function mergePaths(...paths: (string | null | undefined)[]): string {
  const seen = new Set<string>()
  const kept: string[] = []

  for (const path of paths) {
    for (const dir of (path ?? '').split(delimiter)) {
      if (dir === '' || seen.has(dir)) continue
      seen.add(dir)
      kept.push(dir)
    }
  }
  return kept.join(delimiter)
}

export interface PathOptions {
  env?: NodeJS.ProcessEnv
  home?: string
  run?: RunShell
  platform?: NodeJS.Platform
}

/** What PATH should be, given the environment this process was handed.
 *
 *  Pure in everything but the shell it asks, so the decision is testable
 *  without a shell and the shell is replaceable in tests. */
export async function resolvedPath(options: PathOptions = {}): Promise<string> {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform

  // Windows has no login shell to ask and no `$SHELL`; its installers put
  // things on the machine's PATH, which this process already has.
  const shell = platform === 'win32' ? undefined : env.SHELL
  const fromShell = shell ? parseShellPath(await (options.run ?? runLoginShell)(shell)) : null

  return mergePaths(env.PATH, fromShell, toolDirs(options.home ?? homedir()).join(delimiter))
}

/** Applies the resolved PATH to this process, once.
 *
 *  Everything that looks for a binary reads `process.env.PATH`, including the
 *  spawn that starts a server, so this is set in one place rather than passed
 *  to each caller. */
export async function applyPath(options: PathOptions = {}): Promise<string> {
  const path = await resolvedPath(options)
  process.env.PATH = path
  return path
}

let pending: Promise<string> | null = null

/** The same work, done once, and never on the way to the first frame.
 *
 *  Asking a login shell costs about a second, because it runs every startup
 *  file the reader has. Waiting for that before the window exists would trade
 *  a bug nobody sees at boot for a delay everybody does. So boot starts this
 *  and moves on, and the one place that needs the answer — deciding whether a
 *  server is installed — waits for it instead. */
export function ensurePath(options: PathOptions = {}): Promise<string> {
  pending ??= applyPath(options)
  return pending
}
