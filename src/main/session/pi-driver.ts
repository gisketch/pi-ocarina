import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type {
  CommandName,
  CommandParams,
  CommandResult,
  EmitEvent,
  SessionDriver,
} from '../../shared/protocol'
import { PiTranslator } from './pi-translate'

// Derived from the factory: pi's ModelRuntime constructor is private.
type ModelRuntimeOf = Awaited<
  ReturnType<typeof import('@earendil-works/pi-coding-agent').ModelRuntime.create>
>

/** Where a workspace id points on disk. Replaced by the real catalog in B3. */
export type ResolveWorkspace = (workspaceId: string) => string

/** A model named the way pi's config names it. */
export interface ModelRef {
  provider: string
  id: string
}

export interface PiDriverOptions {
  emit: EmitEvent
  resolveWorkspace: ResolveWorkspace
  /** Overrides pi's configured default. Left unset, pi chooses — which is the
   *  product decision: provider and model live in pi's config, not ours. */
  model?: ModelRef
}

interface Thread {
  session: AgentSession
  translator: PiTranslator
  unsubscribe: () => void
}

/** Hosts pi `AgentSession`s in the main process, one per thread.
 *
 *  Everything pi-shaped stops here: the driver speaks pi inwards and the shared
 *  protocol outwards, so nothing above it needs to change when pi does. */
export class PiDriver implements SessionDriver {
  readonly kind = 'pi'

  #threads = new Map<string, Thread>()
  #created = 0
  #sdk: Promise<typeof import('@earendil-works/pi-coding-agent')> | null = null
  #runtime: Promise<ModelRuntimeOf> | null = null

  readonly #emit: EmitEvent
  readonly #resolveWorkspace: ResolveWorkspace
  readonly #model: ModelRef | undefined

  constructor({ emit, resolveWorkspace, model }: PiDriverOptions) {
    this.#emit = emit
    this.#resolveWorkspace = resolveWorkspace
    this.#model = model
  }

  async execute<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<CommandResult<N>> {
    switch (name) {
      case 'createThread': {
        const { workspaceId } = params as CommandParams<'createThread'>
        const threadId = await this.#createThread(workspaceId)
        return { threadId } as CommandResult<N>
      }

      case 'prompt': {
        const { threadId, text } = params as CommandParams<'prompt'>
        this.#startTurn(threadId, text)
        return { ok: true } as CommandResult<N>
      }

      case 'cancelTurn': {
        const { threadId } = params as CommandParams<'cancelTurn'>
        await this.#thread(threadId).session.abort()
        this.#emit(threadId, { kind: 'thread-state', state: 'idle' })
        return { ok: true } as CommandResult<N>
      }

      case 'archiveThread': {
        const { threadId } = params as CommandParams<'archiveThread'>
        this.#close(threadId)
        return { ok: true } as CommandResult<N>
      }

      default:
        // Steering, approvals, checkpoints and model control arrive in B4–B6.
        return { ok: true } as CommandResult<N>
    }
  }

  async dispose(): Promise<void> {
    for (const threadId of [...this.#threads.keys()]) this.#close(threadId)
  }

  /** The pi session file backing a thread — the transcript's real home. */
  sessionFile(threadId: string): string | undefined {
    return this.#threads.get(threadId)?.session.sessionFile
  }

  async #createThread(workspaceId: string): Promise<string> {
    const { createAgentSession } = await this.#load()
    const cwd = this.#resolveWorkspace(workspaceId)

    // Credentials and the model catalogue stay in pi's config; the app only ever
    // names a model, and names none at all unless asked to.
    const { session } = await createAgentSession({ cwd, model: await this.#resolveModel() })
    await this.#bindToolsToWorkspace(session, cwd)

    this.#created += 1
    const threadId = `pi-${this.#created}`
    const translator = new PiTranslator()

    const unsubscribe = session.subscribe((event) => {
      for (const translated of translator.translate(event)) this.#emit(threadId, translated)
      if (event.type === 'turn_end') this.#emitUsage(threadId, session)
    })

    this.#threads.set(threadId, { session, translator, unsubscribe })
    return threadId
  }

  #startTurn(threadId: string, text: string): void {
    const { session } = this.#thread(threadId)
    this.#emit(threadId, { kind: 'user-message', id: `user-${Date.now()}`, text })

    // Deliberately not awaited: a turn runs for minutes and the caller's IPC
    // reply must not wait for it. Progress and failure both arrive as events.
    void session.prompt(text).catch((error: unknown) => {
      this.#emit(threadId, {
        kind: 'thread-state',
        state: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      })
    })
  }

  /** Usage comes from pi's own accounting; the app never estimates its own. */
  #emitUsage(threadId: string, session: AgentSession): void {
    try {
      const stats = session.getSessionStats()
      const percent = stats.contextUsage?.percent
      this.#emit(threadId, {
        kind: 'usage',
        contextPercent: percent ?? 0,
        tokens: stats.tokens.total,
        costUsd: stats.cost,
      })
    } catch {
      // Stats are a nicety; losing them must never break a turn.
    }
  }

  /** Points the built-in tools at the workspace folder.
   *
   *  pi 0.84's `createAgentSession({ cwd })` uses cwd to name the session file
   *  and find project resources, but still builds its tools against
   *  `process.cwd()` — verified directly: a session with cwd set to a temp
   *  folder read files out of the Electron process's directory instead.
   *
   *  That is fatal here, where several workspaces run in one process and each
   *  is a different folder, so the tools are rebuilt bound to the right cwd.
   *  Replacing `agent.state.tools` is pi's own documented way to swap tools.
   *  Revisit when pi honours cwd, or when sessions move to a utilityProcess
   *  (which would give each workspace a real process cwd of its own). */
  async #bindToolsToWorkspace(session: AgentSession, cwd: string): Promise<void> {
    const sdk = await this.#load()
    const rebound = [
      sdk.createReadTool(cwd),
      sdk.createBashTool(cwd),
      sdk.createEditTool(cwd),
      sdk.createWriteTool(cwd),
      sdk.createGrepTool(cwd),
      sdk.createFindTool(cwd),
      sdk.createLsTool(cwd),
    ]

    const replaced = new Set(rebound.map((tool) => tool.name))
    const kept = session.agent.state.tools.filter((tool) => !replaced.has(tool.name))
    // Extension and custom tools are left alone — they bind their own cwd.
    session.agent.state.tools = [...rebound, ...kept]
  }

  async #resolveModel(): Promise<ReturnType<ModelRuntimeOf['getModel']> | undefined> {
    if (!this.#model) return undefined

    const { ModelRuntime } = await this.#load()
    this.#runtime ??= ModelRuntime.create()
    const model = (await this.#runtime).getModel(this.#model.provider, this.#model.id)
    if (!model) {
      throw new Error(`pi has no model "${this.#model.provider}/${this.#model.id}" configured`)
    }
    return model
  }

  #thread(threadId: string): Thread {
    const thread = this.#threads.get(threadId)
    if (!thread) throw new Error(`unknown thread: ${threadId}`)
    return thread
  }

  #close(threadId: string): void {
    const thread = this.#threads.get(threadId)
    if (!thread) return
    thread.unsubscribe()
    thread.session.dispose()
    this.#threads.delete(threadId)
  }

  /** Loaded on first use: pi is a heavy import and the window should paint first. */
  #load(): Promise<typeof import('@earendil-works/pi-coding-agent')> {
    this.#sdk ??= import('@earendil-works/pi-coding-agent')
    return this.#sdk
  }
}
