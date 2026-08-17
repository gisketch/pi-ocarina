/** One place that owns every workspace's language servers.
 *
 *  A pool per workspace, because a server is started with a root and a root is
 *  what a workspace is. The sessions ask it for tools, the settings screen asks
 *  it what exists, and the status bar asks it what is up — so the answer to all
 *  three comes from one object rather than three that could disagree. */

import type { LspServerState, WorkspaceLsp } from '../../shared/lsp'
import type { CommandName, CommandParams } from '../../shared/commands'
import { detectServers, worthShowing } from './detect'
import { LspPool } from './pool'

/** Just enough of the catalog for this to read and write one setting. */
export interface LspSettingsStore {
  lspFor(workspaceId: string): WorkspaceLsp | undefined
  setLsp(workspaceId: string, lsp: WorkspaceLsp): void
  workspace(workspaceId: string): { path: string } | undefined
}

export class LspService {
  readonly #pools = new Map<string, LspPool>()
  readonly #store: LspSettingsStore
  readonly #make: (root: string) => LspPool

  constructor(store: LspSettingsStore, make: (root: string) => LspPool = (root) => new LspPool(root)) {
    this.#store = store
    this.#make = make
  }

  settingsFor(workspaceId: string): WorkspaceLsp | undefined {
    return this.#store.lspFor(workspaceId)
  }

  /** The pool for a workspace, made on first use.
   *
   *  Making one costs nothing — a pool starts no processes until a call needs
   *  one — so there is no reason to be careful about when this is called. */
  poolFor(workspaceId: string, cwd: string): LspPool {
    const already = this.#pools.get(workspaceId)
    if (already) return already

    const pool = this.#make(cwd)
    this.#pools.set(workspaceId, pool)
    return pool
  }

  /** What the settings screen and the status bar draw. */
  async states(workspaceId: string): Promise<{ on: boolean; servers: LspServerState[] }> {
    const workspace = this.#store.workspace(workspaceId)
    const settings = this.#store.lspFor(workspaceId)
    if (!workspace) return { on: false, servers: [] }

    const detected = await detectServers(workspace.path, settings)
    const pool = this.#pools.get(workspaceId)
    const decorated = pool ? pool.decorate(detected) : detected

    return { on: settings?.on === true, servers: worthShowing(decorated) }
  }

  /** Switches LSP for a workspace, or one server inside it.
   *
   *  Turning something off stops what it turned off. Leaving a process running
   *  after the reader switched it off would make the setting a suggestion. */
  async set(
    workspaceId: string,
    change: { on?: boolean; serverId?: string; enabled?: boolean },
  ): Promise<void> {
    const current = this.#store.lspFor(workspaceId) ?? { on: false }
    const next: WorkspaceLsp = {
      on: change.on ?? current.on,
      ...(current.servers ? { servers: { ...current.servers } } : {}),
    }

    if (change.serverId !== undefined && change.enabled !== undefined) {
      next.servers = { ...(next.servers ?? {}), [change.serverId]: change.enabled }
    }

    this.#store.setLsp(workspaceId, next)

    const stopping = next.on === false || change.enabled === false
    if (stopping) await this.#pools.get(workspaceId)?.stopAll()
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.#pools.values()].map((pool) => pool.stopAll()))
    this.#pools.clear()
  }
}

/** The two commands the Workspace Settings screen sends. */
export async function handleLsp(
  service: LspService,
  name: CommandName,
  params: unknown,
): Promise<unknown> {
  switch (name) {
    case 'workspaceLsp': {
      const { workspaceId } = params as CommandParams<'workspaceLsp'>
      return service.states(workspaceId)
    }

    case 'setWorkspaceLsp': {
      const { workspaceId, ...change } = params as CommandParams<'setWorkspaceLsp'>
      await service.set(workspaceId, change)
      return { ok: true }
    }

    default:
      throw new Error(`not an lsp command: ${name}`)
  }
}
