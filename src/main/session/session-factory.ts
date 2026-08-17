import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ApprovalGate } from './approvals'
import type { AskGate } from './ask-gate'
import { buildResources, canSpawn, type ChildShape } from './session-extensions'
import { SPAWN_TOOL, type SpawnDeps } from './spawn-tool'
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
  /** Supplied after construction: the fleet is built from this factory, so the
   *  two cannot be constructed in one order. A session started before it
   *  arrives simply has no spawn tool. */
  #spawn: Omit<SpawnDeps, 'handle' | 'where' | 'depth'> | undefined
  #where: ((workspaceId: string, cwd: string) => SpawnDeps['where']) | undefined

  constructor(approvals: ApprovalGate, asks: AskGate, model?: ModelRef) {
    this.#approvals = approvals
    this.#asks = asks
    this.#model = model
  }

  /** Lets sessions spawn children. Called once, after the fleet exists. */
  enableSpawning(deps: Omit<SpawnDeps, 'handle' | 'where' | 'depth'>): void {
    this.#spawn = deps
    this.#where = (workspaceId, cwd) => () => ({ workspaceId, cwd })
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
      resourceLoader: await this.#loader(cwd, workspaceId, handle),
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
      resourceLoader: await this.#loader(cwd, workspaceId, { threadId }),
    })

    await this.bindToolsToWorkspace(session, cwd)
    return session
  }

  /** A child agent: a session with no file, a narrowed tool set, and its own
   *  system prompt.
   *
   *  It takes the approval gate bound to its **parent's** thread and workspace,
   *  which is the whole reason children run in this process rather than as
   *  spawned `pi` subprocesses: a child that writes to disk raises a card in the
   *  thread the reader is watching, under the rules that workspace already has.
   *
   *  It does not take `ask_user`. A child's question would arrive in the parent's
   *  column with none of the parent's context around it, and several children
   *  could ask at once — so a child that wants something from a person says so in
   *  its final message and lets the parent ask. */
  async child(options: {
    cwd: string
    workspaceId: string
    /** The parent's thread: where the child's rows and cards appear. */
    handle: ThreadHandle
    instructions: string
    tools: string[]
    model?: string
    /** 1 for a child of a thread, 2 for a child of a child. A child at depth 1
     *  may spawn its own; one at depth 2 gets no spawn tool, which is how the
     *  tree stays as deep as the column can indent. */
    depth: number
    /** Whether its role allows it to spawn. An inline prompt never may: it is
     *  held to read-only tools, and a child it started could write. */
    spawns: boolean
    /** Who this child is, so a card it raises can say who is asking. */
    agent: { name: string; role: string }
    /** Told when the model a role names is not configured here, so the fan-out
     *  can say so rather than swallowing it. */
    onWarning?: (warning: string) => void
  }): Promise<AgentSession> {
    const { createAgentSession, SessionManager } = await this.load()

    const { session } = await createAgentSession({
      cwd: options.cwd,
      // No session file: a child is not a thread. It is never listed, never
      // reopened, and its transcript lives only in the rows under the call.
      sessionManager: SessionManager.inMemory(options.cwd),
      model: await this.#childModel(options.model, options.onWarning),
      // pi filters custom tools by this list too, so a child that may spawn has
      // to be handed the tool by name or it silently never has it.
      tools: canSpawn(options.depth, options.spawns)
        ? [...options.tools, SPAWN_TOOL]
        : options.tools,
      resourceLoader: await this.#loader(options.cwd, options.workspaceId, options.handle, {
        ask: false,
        appendSystemPrompt: options.instructions,
        depth: options.depth,
        spawns: options.spawns,
        agent: options.agent,
      }),
    })

    await this.bindToolsToWorkspace(session, options.cwd)
    return session
  }

  /** The model a child runs on, falling back rather than failing.
   *
   *  A role ships with a model id, and an id ages: the model is retired, or the
   *  user never configured that provider. Failing the child there would mean a
   *  fan-out that dies on first use because of a default nobody chose — proven
   *  live, where the shipped `scout` named a model this machine did not have and
   *  every scout failed before running. It falls back to the session's own model
   *  and says so, because a child quietly running on a model ten times the price
   *  of the one its role names is worse than a warning. */
  async #childModel(
    named: string | undefined,
    warn: ((warning: string) => void) | undefined,
  ): Promise<ReturnType<ModelRuntimeOf['getModel']> | undefined> {
    if (!named) return this.#resolveModel()

    try {
      return await this.#resolveModel(named)
    } catch {
      warn?.(`model "${named}" is not configured here; used this session's model instead`)
      return this.#resolveModel()
    }
  }

  /** The resource loader for one session, with this app's extensions in it. */
  async #loader(
    cwd: string,
    workspaceId: string,
    handle: ThreadHandle,
    child?: ChildShape,
  ): Promise<ResourceLoaderOf> {
    return buildResources(
      await this.load(),
      { approvals: this.#approvals, asks: this.#asks, spawn: this.#spawn, where: this.#where },
      cwd,
      workspaceId,
      handle,
      child,
    )
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

  /** The model this session runs on.
   *
   *  A child may name its own as `provider/id`; naming none means it borrows
   *  whatever the app is configured with, which is what "inherits the parent's
   *  model" amounts to here. */
  async #resolveModel(named?: string): Promise<ReturnType<ModelRuntimeOf['getModel']> | undefined> {
    const wanted = named ? splitModel(named) : this.#model
    if (!wanted) return undefined

    const { ModelRuntime } = await this.load()
    this.#runtime ??= ModelRuntime.create()
    const model = (await this.#runtime).getModel(wanted.provider, wanted.id)
    if (!model) {
      throw new Error(`pi has no model "${wanted.provider}/${wanted.id}" configured`)
    }
    return model
  }
}

/** `provider/id`, the way pi's own config and its `--model` flag spell it.
 *
 *  Split on the first slash only: a model id may contain slashes of its own
 *  (`anthropic/claude-…` versus an OpenRouter id like `x-ai/grok`), and the
 *  provider never does. */
function splitModel(named: string): ModelRef {
  const at = named.indexOf('/')
  if (at === -1) throw new Error(`model "${named}" needs the form provider/id`)
  return { provider: named.slice(0, at), id: named.slice(at + 1) }
}
