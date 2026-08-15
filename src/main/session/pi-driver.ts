import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type {
  CommandName,
  CommandParams,
  CommandResult,
  EmitEvent,
  SessionDriver,
} from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'
import { ApprovalGate } from './approvals'
import { PiTranslator } from './pi-translate'
import { replayEntries } from './replay'
import { WorkspaceService, type Sdk } from './workspaces'

// Derived from the factory: pi's ModelRuntime constructor is private.
type ModelRuntimeOf = Awaited<ReturnType<Sdk['ModelRuntime']['create']>>
type ResourceLoaderOf = InstanceType<Sdk['DefaultResourceLoader']>

/** A model named the way pi's config names it. */
export interface ModelRef {
  provider: string
  id: string
}

export interface PiDriverOptions {
  emit: EmitEvent
  catalog: CatalogStore
  /** Overrides pi's configured default. Left unset, pi chooses — which is the
   *  product decision: provider and model live in pi's config, not ours. */
  model?: ModelRef
}

interface Thread {
  session: AgentSession
  unsubscribe: () => void
}

/** Lets the approval extension name its thread, which only exists once pi has
 *  created the session the extension is being built for. */
interface ThreadHandle {
  threadId: string
}

/** Hosts pi `AgentSession`s in the main process, one per open thread.
 *
 *  Everything pi-shaped stops here: the driver speaks pi inwards and the shared
 *  protocol outwards, so nothing above it needs to change when pi does. */
export class PiDriver implements SessionDriver {
  readonly kind = 'pi'

  #threads = new Map<string, Thread>()
  #sdk: Promise<Sdk> | null = null
  #runtime: Promise<ModelRuntimeOf> | null = null

  readonly #emit: EmitEvent
  readonly #model: ModelRef | undefined
  readonly #workspaces: WorkspaceService
  readonly #approvals: ApprovalGate
  readonly #catalog: CatalogStore

  constructor({ emit, catalog, model }: PiDriverOptions) {
    this.#emit = emit
    this.#model = model
    this.#catalog = catalog
    this.#workspaces = new WorkspaceService(catalog, () => this.#load())
    this.#approvals = new ApprovalGate(emit, catalog)
  }

  async execute<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<CommandResult<N>> {
    switch (name) {
      case 'listWorkspaces':
        return { workspaces: this.#workspaces.list() } as CommandResult<N>

      case 'pinWorkspace': {
        const { path } = params as CommandParams<'pinWorkspace'>
        return { workspace: await this.#workspaces.pin(path) } as CommandResult<N>
      }

      case 'unpinWorkspace': {
        const { workspaceId } = params as CommandParams<'unpinWorkspace'>
        this.#workspaces.unpin(workspaceId)
        return { ok: true } as CommandResult<N>
      }

      case 'listThreads': {
        const { workspaceId } = params as CommandParams<'listThreads'>
        return { threads: await this.#workspaces.listThreads(workspaceId) } as CommandResult<N>
      }

      case 'createThread': {
        const { workspaceId } = params as CommandParams<'createThread'>
        return { threadId: await this.#createThread(workspaceId) } as CommandResult<N>
      }

      case 'openThread': {
        const { threadId } = params as CommandParams<'openThread'>
        await this.#openThread(threadId)
        return { ok: true } as CommandResult<N>
      }

      case 'prompt': {
        const { threadId, text } = params as CommandParams<'prompt'>
        this.#startTurn(threadId, text)
        return { ok: true } as CommandResult<N>
      }

      case 'resolveApproval': {
        const { approvalId, outcome } = params as CommandParams<'resolveApproval'>
        this.#approvals.resolve(approvalId, outcome)
        return { ok: true } as CommandResult<N>
      }

      case 'listApprovalRules': {
        const { workspaceId } = params as CommandParams<'listApprovalRules'>
        return { rules: this.#catalog.listApprovals(workspaceId) } as CommandResult<N>
      }

      case 'revokeApprovalRule': {
        const { workspaceId, rule } = params as CommandParams<'revokeApprovalRule'>
        this.#catalog.removeApproval(workspaceId, rule)
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
    const cwd = this.#workspaces.pathOf(workspaceId)

    // Credentials and the model catalogue stay in pi's config; the app only ever
    // names a model, and names none at all unless asked to.
    const handle: ThreadHandle = { threadId: '' }
    const { session } = await createAgentSession({
      cwd,
      model: await this.#resolveModel(),
      resourceLoader: await this.#resources(cwd, workspaceId, handle),
    })

    handle.threadId = this.#adopt(session, cwd)
    return handle.threadId
  }

  /** Loads pi's usual resources plus one extension of ours: the approval gate.
   *
   *  `tool_call` is pi's only place to stand between the model and the disk, and
   *  it can wait on a promise — so the handler simply asks the user and blocks
   *  until they answer. */
  async #resources(
    cwd: string,
    workspaceId: string,
    handle: ThreadHandle,
  ): Promise<ResourceLoaderOf> {
    const { DefaultResourceLoader, getAgentDir } = await this.#load()
    const gate = this.#approvals

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      extensionFactories: [
        {
          name: 'piocarina-approvals',
          factory: (pi) => {
            pi.on('tool_call', async (event) => {
              const verdict = await gate.request({
                threadId: handle.threadId,
                workspaceId,
                toolName: event.toolName,
                input: event.input,
              })
              return verdict.blocked ? { block: true, reason: verdict.reason } : undefined
            })
          },
        },
      ],
    })

    // A freshly constructed loader holds nothing: without this the extension is
    // never built, and the gate silently never runs. Learned the hard way.
    await loader.reload()
    return loader
  }

  /** Reopens a thread: its history is replayed as events before the live session
   *  is attached, so watching a thread and returning to it look the same. */
  async #openThread(threadId: string): Promise<void> {
    if (this.#threads.has(threadId)) return

    const { createAgentSession, SessionManager } = await this.#load()
    const { path, cwd } = await this.#workspaces.locate(threadId)

    const sessionManager = SessionManager.open(path)
    for (const event of replayEntries(sessionManager.getEntries())) this.#emit(threadId, event)

    // The thread id is already known here, unlike on creation.
    const workspaceId = this.#workspaces.idForPath(cwd)
    const { session } = await createAgentSession({
      cwd,
      sessionManager,
      model: await this.#resolveModel(),
      resourceLoader: await this.#resources(cwd, workspaceId, { threadId }),
    })
    this.#adopt(session, cwd)
  }

  /** Takes ownership of a session: binds its tools, wires its events, and files
   *  it under pi's own session id so the thread survives a relaunch. */
  #adopt(session: AgentSession, cwd: string): string {
    const threadId = session.sessionId
    void this.#bindToolsToWorkspace(session, cwd)

    const translator = new PiTranslator()
    const unsubscribe = session.subscribe((event) => {
      for (const translated of translator.translate(event)) this.#emit(threadId, translated)
      if (event.type === 'turn_end') this.#emitUsage(threadId, session)
    })

    this.#threads.set(threadId, { session, unsubscribe })
    if (session.sessionFile) {
      this.#workspaces.remember(threadId, { path: session.sessionFile, cwd })
    }
    return threadId
  }

  #startTurn(threadId: string, text: string): void {
    const { session } = this.#thread(threadId)
    this.#emit(threadId, { kind: 'user-message', id: `user-${session.sessionId}-${text.length}`, text })

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
      this.#emit(threadId, {
        kind: 'usage',
        contextPercent: stats.contextUsage?.percent ?? 0,
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
   *  `process.cwd()` — verified directly: a session rooted at a temp folder read
   *  files out of the Electron process's directory instead.
   *
   *  That is fatal here, where several workspaces run in one process and each is
   *  a different folder, so the tools are rebuilt bound to the right cwd.
   *  Replacing `agent.state.tools` is pi's own documented way to swap tools.
   *  Revisit when pi honours cwd, or when sessions move to a utilityProcess. */
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
    // Anything waiting on an answer is released rather than left hanging.
    this.#approvals.abandon(threadId)
    thread.session.dispose()
    this.#threads.delete(threadId)
  }

  /** Loaded on first use: pi is a heavy import and the window should paint first. */
  #load(): Promise<Sdk> {
    this.#sdk ??= import('@earendil-works/pi-coding-agent')
    return this.#sdk
  }
}
