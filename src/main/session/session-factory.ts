import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ApprovalGate } from './approvals'
import type { AskGate } from './ask-gate'
import { buildResources, canSpawn, type ChildShape } from './session-extensions'
import { demote, type LspExtensionDeps } from './lsp-extension'
import { SPAWN_TOOL, type SpawnDeps } from './spawn-tool'
import { ModelBook, type ModelRef } from './session-models'
import type { Sdk } from './workspaces'

type ResourceLoaderOf = InstanceType<Sdk['DefaultResourceLoader']>

export type { ModelRef } from './session-models'

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

  readonly #approvals: ApprovalGate
  readonly #asks: AskGate
  readonly #models: ModelBook
  /** Supplied after construction: the fleet is built from this factory, so the
   *  two cannot be constructed in one order. A session started before it
   *  arrives simply has no spawn tool. */
  #spawn: Omit<SpawnDeps, 'handle' | 'where' | 'depth'> | undefined
  #where: ((workspaceId: string, cwd: string) => SpawnDeps['where']) | undefined
  /** Supplied after construction, like spawning. Absent means no session in
   *  this app has language servers, which is what the tests without one get. */
  #lsp: ((workspaceId: string, cwd: string) => LspExtensionDeps | null) | undefined
  /** The reader's voice for a thread, as prompt lines. Absent means no session
   *  carries one, which is what "normal" is. */
  #mode: ((threadId: string) => string[]) | undefined

  constructor(approvals: ApprovalGate, asks: AskGate, model?: ModelRef) {
    this.#approvals = approvals
    this.#asks = asks
    this.#models = new ModelBook(() => this.load(), model)
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

  /** Lets sessions carry the reader's voice. Called once. */
  enableModes(mode: (threadId: string) => string[]): void {
    this.#mode = mode
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
      model: await this.#models.resolve(),
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
      model: await this.#models.resolve(),
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
  }): Promise<{ session: AgentSession; model?: string }> {
    const { createAgentSession, SessionManager } = await this.load()
    // pi filters custom tools by this list too, so a child that may spawn has
    // to be handed the tool by name or it silently never has it.
    const tools = canSpawn(options.depth, options.spawns)
      ? [...options.tools, SPAWN_TOOL]
      : options.tools

    const chosen = await this.#models.forChild(options.model, options.onWarning)

    const { session } = await createAgentSession({
      cwd: options.cwd,
      // No session file: a child is not a thread. It is never listed, never
      // reopened, and its transcript lives only in the rows under the call.
      sessionManager: SessionManager.inMemory(options.cwd),
      model: chosen.model,
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
    // The session's own model outranks the book's answer: when this app names
    // no model at all — "pi default" — the book has nothing to say, but pi has
    // still chosen one and the session knows which. Asking pi is the only way
    // the peek can name the default instead of showing nothing.
    const ran = session.model
    return { session, model: ran ? `${ran.provider}/${ran.id}` : chosen.named }
  }

  /** A bare completion session: no file, no tools, no extensions.
   *
   *  What the thread titler runs on. Not `child()` — a child is wired into a
   *  parent's column, its approval gate and its fleet, and a titler that could
   *  raise an approval card would be a pop-up about naming. `named` falls back
   *  the same way a child's model does: an id this machine does not have means
   *  the session default, never a failure. */
  async oneShot(cwd: string, named?: string): Promise<AgentSession> {
    const { createAgentSession, SessionManager } = await this.load()

    const { session } = await createAgentSession({
      cwd,
      sessionManager: SessionManager.inMemory(cwd),
      model: (await this.#models.forChild(named)).model,
      tools: [],
    })
    return session
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
        mode: this.#mode,
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

  /** The models this machine can actually run. */
  models(): ReturnType<ModelBook['available']> {
    return this.#models.available()
  }
}
