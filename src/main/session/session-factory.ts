import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ApprovalGate } from './approvals'
import type { AskGate } from './ask-gate'
import { askUserTool } from './ask-tool'
import type { Sdk } from './workspaces'

// Derived from the factory: pi's ModelRuntime constructor is private.
type ModelRuntimeOf = Awaited<ReturnType<Sdk['ModelRuntime']['create']>>
type ResourceLoaderOf = InstanceType<Sdk['DefaultResourceLoader']>

/** A model named the way pi's config names it. */
export interface ModelRef {
  provider: string
  id: string
}

/** Lets the approval extension name its thread, which on a new session only
 *  exists after pi has finished building the session the extension is part of. */
export interface ThreadHandle {
  threadId: string
}

/** Builds pi sessions that behave the way this app needs them to.
 *
 *  Everything awkward about standing a session up lives here — the approval
 *  extension, the tool rebinding, model lookup — so the driver above is about
 *  threads and commands rather than about pi's construction quirks. */
export class SessionFactory {
  #sdk: Promise<Sdk> | null = null
  #runtime: Promise<ModelRuntimeOf> | null = null

  readonly #approvals: ApprovalGate
  readonly #asks: AskGate
  readonly #model: ModelRef | undefined

  constructor(approvals: ApprovalGate, asks: AskGate, model?: ModelRef) {
    this.#approvals = approvals
    this.#asks = asks
    this.#model = model
  }

  /** Loaded on first use: pi is a heavy import and the window should paint first. */
  load(): Promise<Sdk> {
    this.#sdk ??= import('@earendil-works/pi-coding-agent')
    return this.#sdk
  }

  /** A brand-new thread in a workspace. */
  async create(cwd: string, workspaceId: string, handle: ThreadHandle): Promise<AgentSession> {
    const { createAgentSession } = await this.load()

    // Credentials and the model catalogue stay in pi's config; the app only ever
    // names a model, and names none at all unless asked to.
    const { session } = await createAgentSession({
      cwd,
      model: await this.#resolveModel(),
      resourceLoader: await this.#resources(cwd, workspaceId, handle),
    })

    await this.bindToolsToWorkspace(session, cwd)
    return session
  }

  /** An existing thread, reattached to its session file on disk. */
  async open(
    cwd: string,
    workspaceId: string,
    sessionManager: Awaited<ReturnType<Sdk['SessionManager']['open']>>,
    threadId: string,
  ): Promise<AgentSession> {
    const { createAgentSession } = await this.load()

    const { session } = await createAgentSession({
      cwd,
      sessionManager,
      model: await this.#resolveModel(),
      resourceLoader: await this.#resources(cwd, workspaceId, { threadId }),
    })

    await this.bindToolsToWorkspace(session, cwd)
    return session
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
    const { DefaultResourceLoader, getAgentDir } = await this.load()
    const gate = this.#approvals
    const asks = this.#asks

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      extensionFactories: [
        {
          // pi 0.84 has no elicitation of its own, so the only way an agent can
          // ask a person anything is a tool this app gives it.
          name: 'piocarina-ask',
          factory: (pi) => {
            pi.registerTool(askUserTool(asks, handle))
          },
        },
        {
          name: 'piocarina-approvals',
          factory: (pi) => {
            pi.on('tool_call', async (event) => {
              const verdict = await gate.request({
                threadId: handle.threadId,
                workspaceId,
                toolName: event.toolName,
                input: event.input,
                toolCallId: event.toolCallId,
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
  async bindToolsToWorkspace(session: AgentSession, cwd: string): Promise<void> {
    const sdk = await this.load()
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

  /** The models this machine can actually run.
   *
   *  `getModels()` returns pi's whole catalogue — over a thousand entries,
   *  nearly all of them for providers with no credentials here. Selecting one
   *  throws "No API key". `getAvailable()` is the set with auth configured,
   *  which is the only honest list to put in front of a person. */
  async models(): Promise<ReturnType<ModelRuntimeOf['getAvailableSnapshot']>> {
    const { ModelRuntime } = await this.load()
    this.#runtime ??= ModelRuntime.create()
    const runtime = await this.#runtime

    const available = await runtime.getAvailable()
    // A machine with no credentials at all gets an empty list, and the selector
    // says so — better than offering models that cannot run.
    return available.length > 0 ? available : runtime.getAvailableSnapshot()
  }

  async #resolveModel(): Promise<ReturnType<ModelRuntimeOf['getModel']> | undefined> {
    if (!this.#model) return undefined

    const { ModelRuntime } = await this.load()
    this.#runtime ??= ModelRuntime.create()
    const model = (await this.#runtime).getModel(this.#model.provider, this.#model.id)
    if (!model) {
      throw new Error(`pi has no model "${this.#model.provider}/${this.#model.id}" configured`)
    }
    return model
  }
}
