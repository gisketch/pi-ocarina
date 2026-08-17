import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ApprovalGate } from './approvals'
import type { AskGate } from './ask-gate'
import { buildResources, canSpawn, type ChildShape } from './session-extensions'
import { demote, type LspExtensionDeps } from './lsp-extension'
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

/** What a session may hold, and how its search tools describe themselves. */
export interface BindOptions {
  /** What this session may hold. Absent means everything, which is what a
   *  thread gets. A child passes its role's ceiling.
   *
   *  Without this the rebinding *widened* every child: it put all seven
   *  built-ins back regardless of what `createAgentSession({ tools })` had
   *  narrowed them to, so a read-only `planner` was handed `write`, `edit` and
   *  `bash` immediately after being denied them. Found in review. */
  allowed?: readonly string[]
  /** Whether this workspace has language servers, which changes what `grep` and
   *  `find` say they are for. */
  demoteSearch?: boolean
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
  /** Supplied after construction, like spawning. Absent means no session in
   *  this app has language servers, which is what the tests without one get. */
  #lsp: ((workspaceId: string, cwd: string) => LspExtensionDeps | null) | undefined

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

  /** Lets sessions reach their workspace's language servers. Called once. */
  enableLsp(lsp: (workspaceId: string, cwd: string) => LspExtensionDeps | null): void {
    this.#lsp = lsp
  }

  /** Whether this workspace's sessions get the language-server treatment. */
  #hasLsp(workspaceId: string, cwd: string): boolean {
    return this.#lsp?.(workspaceId, cwd) != null
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

    await this.bindToolsToWorkspace(session, cwd, {
      demoteSearch: this.#hasLsp(workspaceId, cwd),
    })
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

    await this.bindToolsToWorkspace(session, cwd, {
      demoteSearch: this.#hasLsp(workspaceId, cwd),
    })
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
    /** Its own id in the fleet, so a fan-out it starts can lend its slot back. */
    selfId: string
    /** Told when the model a role names is not configured here, so the fan-out
     *  can say so rather than swallowing it. */
    onWarning?: (warning: string) => void
  }): Promise<AgentSession> {
    const { createAgentSession, SessionManager } = await this.load()
    // pi filters custom tools by this list too, so a child that may spawn has
    // to be handed the tool by name or it silently never has it.
    const tools = canSpawn(options.depth, options.spawns)
      ? [...options.tools, SPAWN_TOOL]
      : options.tools

    const { session } = await createAgentSession({
      cwd: options.cwd,
      // No session file: a child is not a thread. It is never listed, never
      // reopened, and its transcript lives only in the rows under the call.
      sessionManager: SessionManager.inMemory(options.cwd),
      model: await this.#childModel(options.model, options.onWarning),
      // pi filters custom tools by this list too, so a child that may spawn has
      // to be handed the tool by name or it silently never has it.
      tools,
      resourceLoader: await this.#loader(options.cwd, options.workspaceId, options.handle, {
        ask: false,
        appendSystemPrompt: options.instructions,
        depth: options.depth,
        spawns: options.spawns,
        agent: options.agent,
        selfId: options.selfId,
      }),
    })

    await this.bindToolsToWorkspace(session, options.cwd, {
      allowed: tools,
      demoteSearch: this.#hasLsp(options.workspaceId, options.cwd),
    })
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
      {
        approvals: this.#approvals,
        asks: this.#asks,
        spawn: this.#spawn,
        where: this.#where,
        lsp: this.#lsp,
      },
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
  async bindToolsToWorkspace(
    session: AgentSession,
    cwd: string,
    options: BindOptions = {},
  ): Promise<void> {
    const { allowed, demoteSearch = false } = options
    const sdk = await this.load()
    const all = [
      sdk.createReadTool(cwd),
      sdk.createBashTool(cwd),
      sdk.createEditTool(cwd),
      sdk.createWriteTool(cwd),
      sdk.createGrepTool(cwd),
      sdk.createFindTool(cwd),
      sdk.createLsTool(cwd),
    ]
    const narrowed = allowed ? all.filter((tool) => allowed.includes(tool.name)) : all
    // Layer two of three. A description alone loses to a model's habits, so the
    // fallback note goes on the tool the model would otherwise reach for first.
    // Never removed: a fallback that does not exist is a lie.
    const rebound = demoteSearch
      ? narrowed.map((tool) =>
          tool.name === 'grep' || tool.name === 'find'
            ? { ...tool, description: demote(tool.description) }
            : tool,
        )
      : narrowed

    // Every built-in is replaced, not only the ones being kept: a tool this
    // session may not hold must be removed, not left bound to the wrong cwd.
    const replaced = new Set(all.map((tool) => tool.name))
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
