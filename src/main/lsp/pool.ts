/** Language servers, started late and let go of.
 *
 *  A type-checker is an expensive process to hold. The rules here are the ones
 *  that make holding several of them survivable: nothing starts until a call
 *  needs it, a server with no work and no recent use is stopped, and a server
 *  that dies is replaced without failing the call that found it dead — but only
 *  when replaying that call cannot change anything. */

import {
  lspEnabledFor,
  serverForPath,
  SHIPPED_SERVERS,
  type LspServerSpec,
  type LspServerState,
  type WorkspaceLsp,
} from '../../shared/lsp'
import { startClient, type LspClient } from './client'

/** How long a server with no references may sit before it is stopped. */
export const IDLE_MS = 5 * 60 * 1000

interface Live {
  client: LspClient
  spec: LspServerSpec
  /** In-flight calls. A server is never reaped while this is above zero. */
  refs: number
  lastUsed: number
  degraded?: boolean
}

export interface PoolOptions {
  servers?: readonly LspServerSpec[]
  /** Injected in tests. */
  start?: (spec: LspServerSpec, root: string) => Promise<LspClient>
  now?: () => number
}

export class NoServerError extends Error {}

/** Everything a workspace's language servers are, for one root. */
export class LspPool {
  readonly #live = new Map<string, Live>()
  readonly #starting = new Map<string, Promise<Live>>()
  readonly #root: string
  readonly #servers: readonly LspServerSpec[]
  readonly #start: (spec: LspServerSpec, root: string) => Promise<LspClient>
  readonly #now: () => number
  #reaper: ReturnType<typeof setInterval> | null = null

  constructor(root: string, options: PoolOptions = {}) {
    this.#root = root
    this.#servers = options.servers ?? SHIPPED_SERVERS
    this.#start = options.start ?? ((spec, at) => startClient(spec, at))
    this.#now = options.now ?? Date.now
  }

  /** The spec that owns this path, when the workspace has it switched on. */
  specFor(path: string, settings: WorkspaceLsp | undefined): LspServerSpec | null {
    const spec = serverForPath(path, this.#servers)
    if (!spec) return null
    return lspEnabledFor(settings, spec.id) ? spec : null
  }

  /** Whether a server for this file is already up.
   *
   *  Asked before injecting diagnostics into an edit: we never start a server
   *  to produce one, because that would put a cold start in the path of a
   *  write the user is waiting on. */
  isRunning(path: string): boolean {
    const spec = serverForPath(path, this.#servers)
    return spec ? this.#live.has(spec.id) : false
  }

  /** Runs `work` against the server for this file, starting one if needed.
   *
   *  `mutating` is the whole of the retry policy: a read may be replayed
   *  against a fresh server, and a rename may not, because a half-applied
   *  rename is worse than a failed one. */
  async withClient<T>(
    path: string,
    settings: WorkspaceLsp | undefined,
    work: (client: LspClient) => Promise<T>,
    mutating = false,
  ): Promise<T> {
    const spec = this.specFor(path, settings)
    if (!spec) throw new NoServerError(`no language server is enabled for ${path}`)

    try {
      return await this.#attempt(spec, work)
    } catch (thrown) {
      if (mutating || !this.#live.has(spec.id)) throw thrown
      // The server died mid-call. Evict it and give the call one more chance
      // against a fresh process; a transport failure is not the caller's fault.
      await this.#evict(spec.id)
      try {
        return await this.#attempt(spec, work)
      } catch (again) {
        const live = this.#live.get(spec.id)
        if (live) live.degraded = true
        throw again
      }
    }
  }

  async #attempt<T>(spec: LspServerSpec, work: (client: LspClient) => Promise<T>): Promise<T> {
    const live = await this.#acquire(spec)
    live.refs += 1
    try {
      return await work(live.client)
    } finally {
      live.refs -= 1
      live.lastUsed = this.#now()
    }
  }

  async #acquire(spec: LspServerSpec): Promise<Live> {
    const already = this.#live.get(spec.id)
    if (already) return already

    // Two calls arriving together must not start two processes.
    const pending = this.#starting.get(spec.id)
    if (pending) return pending

    const promise = (async (): Promise<Live> => {
      const client = await this.#start(spec, this.#root)
      const live: Live = { client, spec, refs: 0, lastUsed: this.#now() }
      this.#live.set(spec.id, live)
      this.#watch()
      return live
    })().finally(() => this.#starting.delete(spec.id))

    this.#starting.set(spec.id, promise)
    return promise
  }

  async #evict(id: string): Promise<void> {
    const live = this.#live.get(id)
    if (!live) return
    this.#live.delete(id)
    await live.client.stop().catch(() => {})
  }

  /** Stops every server with no work and no recent use. */
  async reapIdle(): Promise<void> {
    const now = this.#now()
    const stale = [...this.#live.entries()].filter(
      ([, live]) => live.refs === 0 && now - live.lastUsed >= IDLE_MS,
    )
    await Promise.all(stale.map(([id]) => this.#evict(id)))
    if (this.#live.size === 0) this.#unwatch()
  }

  #watch(): void {
    if (this.#reaper) return
    this.#reaper = setInterval(() => void this.reapIdle(), 60_000)
    // Never a reason to hold the process open.
    this.#reaper.unref?.()
  }

  #unwatch(): void {
    if (!this.#reaper) return
    clearInterval(this.#reaper)
    this.#reaper = null
  }

  /** Which servers are up, for the status bar. */
  running(): { id: string; degraded: boolean }[] {
    return [...this.#live.values()].map((live) => ({
      id: live.spec.id,
      degraded: live.degraded === true,
    }))
  }

  /** Folds the live state into what the settings screen and the chip read. */
  decorate(states: readonly LspServerState[]): LspServerState[] {
    const live = new Map(this.running().map((one) => [one.id, one]))
    return states.map((state) => {
      const found = live.get(state.id)
      return found
        ? { ...state, running: true, ...(found.degraded ? { degraded: true } : {}) }
        : state
    })
  }

  async stopAll(): Promise<void> {
    this.#unwatch()
    const ids = [...this.#live.keys()]
    await Promise.all(ids.map((id) => this.#evict(id)))
  }
}
