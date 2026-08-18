/** Which servers make sense here, and which of them are actually installed.
 *
 *  Detection offers; it never enables. A workspace that happens to contain a
 *  `package.json` has not asked for a background daemon, and starting one
 *  because a file exists would be this app deciding something the reader did
 *  not. The settings screen shows the offer and the reader takes it. */

import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { ensurePath } from '../env-path'
import {
  lspEnabledFor,
  SHIPPED_SERVERS,
  type LspServerSpec,
  type LspServerState,
  type WorkspaceLsp,
} from '../../shared/lsp'

/** How far below the workspace root a marker file still counts.
 *
 *  The root alone was wrong for the shape most polyglot repositories actually
 *  have: a `global.json` at the top and the React app down in `src/frontend`.
 *  That workspace was offered C# and nothing else, which is the one case the
 *  polyglot support exists for. Three levels reaches `src/frontend/`,
 *  `apps/web/`, and `services/api/` without becoming a repository walk. */
export const MARKER_DEPTH = 3

/** Directories never descended into. Build output and dependencies contain
 *  thousands of `package.json` files, none of which say anything about what
 *  this repository is written in. */
const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'bin',
  'obj',
  '.venv',
  'venv',
  '.next',
  '.nuxt',
  'coverage',
])

function matches(name: string, exact: readonly string[], globs: readonly string[]): boolean {
  return exact.includes(name) || globs.some((glob) => name.endsWith(glob.slice(1)))
}

/** Whether one of a server's root files exists at or under the workspace root.
 *
 *  A pattern like `*.csproj` matches by extension, because a C# project's file
 *  is named after the project and its name cannot be known in advance. */
export async function hasRootFile(
  cwd: string,
  patterns: readonly string[],
  depth: number = MARKER_DEPTH,
): Promise<boolean> {
  if (patterns.length === 0) return false

  const globs = patterns.filter((one) => one.startsWith('*.'))
  const exact = patterns.filter((one) => !one.startsWith('*.'))

  let level = [cwd]
  for (let below = 0; below <= depth && level.length > 0; below += 1) {
    const next: string[] = []

    for (const dir of level) {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (below < depth && !SKIP.has(entry.name) && !entry.name.startsWith('.')) {
            next.push(join(dir, entry.name))
          }
          continue
        }
        if (matches(entry.name, exact, globs)) return true
      }
    }
    level = next
  }
  return false
}

/** Whether a command resolves on PATH.
 *
 *  Resolved by looking rather than by running: executing an unknown binary to
 *  find out whether it exists is exactly the thing not to do. */
export async function onPath(command: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (command.includes('/')) {
    try {
      await access(command, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    try {
      await access(join(dir, command), constants.X_OK)
      return true
    } catch {
      // Not in this directory.
    }
  }
  return false
}

export interface DetectOptions {
  servers?: readonly LspServerSpec[]
  env?: NodeJS.ProcessEnv
}

/** Every server worth showing for this workspace, and what state it is in. */
export async function detectServers(
  cwd: string,
  settings: WorkspaceLsp | undefined,
  options: DetectOptions = {},
): Promise<LspServerState[]> {
  const servers = options.servers ?? SHIPPED_SERVERS

  // A caller with its own environment is describing one, not asking about this
  // machine, so it is never made to wait for a shell.
  if (!options.env) await ensurePath()

  return Promise.all(
    servers.map(async (server): Promise<LspServerState> => {
      const [plausible, installed] = await Promise.all([
        hasRootFile(cwd, server.rootFiles),
        onPath(server.command, options.env),
      ])

      return {
        id: server.id,
        label: server.label,
        plausible,
        installed,
        enabled: lspEnabledFor(settings, server.id),
        ...(settings?.servers?.[server.id] !== undefined ? { explicit: true } : {}),
        install: server.install,
      }
    }),
  )
}

/** The servers the settings screen lists.
 *
 *  A server for a language this workspace does not contain is noise — the
 *  master switch being on is not a reason to offer Rust to a repository with no
 *  Cargo.toml. One the reader has an opinion about stays listed however the
 *  workspace looks, because a server they switched off has to be switchable
 *  back on. */
export function worthShowing(states: readonly LspServerState[]): LspServerState[] {
  return states.filter((state) => state.plausible || state.explicit)
}
