/** The open workspace's language servers, as its settings screen sees them.
 *
 *  Main owns the answer: only main may look at the disk or at PATH, and only
 *  main knows which processes are up. This is a copy the screen draws, refreshed
 *  whenever it opens, because a server can start or die while the screen is
 *  closed and a stale row would be a lie about what the agent can do.
 *
 *  The browser harness has no backend, so it shows a plausible workspace
 *  instead — a screen that says "error" where seven rows belong cannot be
 *  reviewed against the design. */

import { lspChip, SHIPPED_SERVERS, type LspServerState } from '../../../../shared/lsp'
import { session } from '../session'

const DEMO: LspServerState[] = SHIPPED_SERVERS.slice(0, 3).map((server, index) => ({
  id: server.id,
  label: server.label,
  plausible: true,
  installed: index !== 2,
  enabled: index === 0,
  ...(index === 0 ? { running: true } : {}),
  install: server.install,
}))

class WorkspaceLspState {
  on = $state(false)
  servers = $state.raw<LspServerState[]>([])
  loading = $state(false)
  error = $state<string | null>(null)
  /** Which install line was last copied, so the row can say so. */
  copied = $state<string | null>(null)

  #workspaceId = ''

  /** What the status bar draws. Null when this workspace is not using LSP. */
  get chip(): string | null {
    return lspChip(this.servers)
  }

  async load(workspaceId: string): Promise<void> {
    this.#workspaceId = workspaceId
    this.copied = null

    if (!session.wired) {
      this.on = true
      this.servers = DEMO
      return
    }

    this.loading = true
    this.error = null
    try {
      const { on, servers } = await session.invoke('workspaceLsp', { workspaceId })
      this.on = on
      this.servers = servers
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      this.loading = false
    }
  }

  /** Switches the workspace, or one server inside it.
   *
   *  The screen is redrawn from main rather than from a guess: turning LSP off
   *  stops processes, and only main knows what actually stopped. */
  async set(change: { on?: boolean; serverId?: string; enabled?: boolean }): Promise<void> {
    if (!session.wired) {
      if (change.on !== undefined) this.on = change.on
      if (change.serverId !== undefined && change.enabled !== undefined) {
        const { serverId, enabled } = change
        this.servers = this.servers.map((one) =>
          one.id === serverId ? { ...one, enabled, explicit: true } : one,
        )
      }
      return
    }

    await session.invoke('setWorkspaceLsp', { workspaceId: this.#workspaceId, ...change })
    await this.load(this.#workspaceId)
  }

  /** Copies an install line. Never runs it: installing software is the reader's
   *  action, and a settings screen that installed things would be a surprise
   *  nobody asked for. */
  async copyInstall(state: LspServerState): Promise<void> {
    this.copied = state.id
    try {
      await navigator.clipboard.writeText(state.install)
    } catch {
      // A clipboard the browser refuses is not worth an error banner; the
      // command is on screen and can be selected by hand.
    }
  }

  forget(): void {
    this.servers = []
    this.error = null
    this.copied = null
  }
}

export const workspaceLsp = new WorkspaceLspState()
