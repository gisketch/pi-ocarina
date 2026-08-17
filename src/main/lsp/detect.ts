/** Which servers make sense here, and which of them are actually installed.
 *
 *  Detection offers; it never enables. A workspace that happens to contain a
 *  `package.json` has not asked for a background daemon, and starting one
 *  because a file exists would be this app deciding something the reader did
 *  not. The settings screen shows the offer and the reader takes it. */

import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import {
  lspEnabledFor,
  SHIPPED_SERVERS,
  type LspServerSpec,
  type LspServerState,
  type WorkspaceLsp,
} from '../../shared/lsp'

/** Whether one of a server's root files exists at the workspace root.
 *
 *  A pattern like `*.csproj` matches by extension, because a C# project's file
 *  is named after the project and its name cannot be known in advance. */
export async function hasRootFile(cwd: string, patterns: readonly string[]): Promise<boolean> {
  if (patterns.length === 0) return false

  const globs = patterns.filter((one) => one.startsWith('*.'))
  const exact = patterns.filter((one) => !one.startsWith('*.'))

  for (const name of exact) {
    try {
      await access(join(cwd, name), constants.F_OK)
      return true
    } catch {
      // Not here. Try the next one.
    }
  }

  if (globs.length === 0) return false
  try {
    const entries = await readdir(cwd)
    return entries.some((entry) => globs.some((glob) => entry.endsWith(glob.slice(1))))
  } catch {
    return false
  }
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
        install: server.install,
      }
    }),
  )
}

/** The servers the settings screen lists.
 *
 *  A server nobody could use here is noise; one that is switched on stays
 *  listed however the workspace looks, because a reader who turned it on has
 *  to be able to turn it off. */
export function worthShowing(states: readonly LspServerState[]): LspServerState[] {
  return states.filter((state) => state.plausible || state.enabled)
}
