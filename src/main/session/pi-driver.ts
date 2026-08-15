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
import { SessionFactory, type ModelRef, type ThreadHandle } from './session-factory'
import { SteerQueue } from './steering'
import { WorkspaceService } from './workspaces'

export type { ModelRef } from './session-factory'

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
  /** The last thing the user asked, so a failed turn can be run again. */
  lastPrompt?: string
  /** Counts prompts, so each user block gets an id of its own. */
  prompts: number
}

/** Hosts pi `AgentSession`s in the main process, one per open thread.
 *
 *  Everything pi-shaped stops here: the driver speaks pi inwards and the shared
 *  protocol outwards, so nothing above it needs to change when pi does. */
export class PiDriver implements SessionDriver {
  readonly kind = 'pi'

  #threads = new Map<string, Thread>()
  readonly #emit: EmitEvent
  readonly #workspaces: WorkspaceService
  readonly #approvals: ApprovalGate
  readonly #catalog: CatalogStore
  readonly #sessions: SessionFactory
  readonly #steers: SteerQueue

  constructor({ emit, catalog, model }: PiDriverOptions) {
    this.#emit = emit
    this.#catalog = catalog
    this.#approvals = new ApprovalGate(emit, catalog)
    this.#steers = new SteerQueue(emit)
    this.#sessions = new SessionFactory(this.#approvals, model)
    this.#workspaces = new WorkspaceService(catalog, () => this.#sessions.load())
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

      case 'steer': {
        const { threadId, text } = params as CommandParams<'steer'>
        return { steerId: await this.#steer(threadId, text) } as CommandResult<N>
      }

      case 'cancelQueuedSteer': {
        const { threadId, steerId } = params as CommandParams<'cancelQueuedSteer'>
        this.#steers.cancel(threadId, steerId)
        return { ok: true } as CommandResult<N>
      }

      case 'restoreCheckpoint': {
        const { threadId, checkpointId } = params as CommandParams<'restoreCheckpoint'>
        await this.#restore(threadId, checkpointId)
        return { threadId } as CommandResult<N>
      }

      case 'compact': {
        const { threadId } = params as CommandParams<'compact'>
        await this.#compact(threadId)
        return { ok: true } as CommandResult<N>
      }

      case 'retryTurn': {
        const { threadId } = params as CommandParams<'retryTurn'>
        const { lastPrompt } = this.#thread(threadId)
        // Nothing to retry is not an error; the UI simply offered a button it
        // did not need to.
        if (lastPrompt) this.#startTurn(threadId, lastPrompt)
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

      // pi 0.84 has no elicitation of its own, so no `ask` event is ever
      // produced and this command has nothing to answer. It is accepted rather
      // than rejected so the seam stays whole for the day pi gains one.
      case 'answerAsk':
        return { ok: true } as CommandResult<N>

      default:
        // Model and reasoning control arrive with the composer work (D5).
        return { ok: true } as CommandResult<N>
    }
  }

  async dispose(): Promise<void> {
    for (const threadId of [...this.#threads.keys()]) this.#close(threadId)
  }

  /** Threads with a turn in flight. Quitting on top of these would abandon work
   *  the user cannot see, so the app asks first. */
  runningThreads(): string[] {
    return [...this.#threads]
      .filter(([, thread]) => thread.session.isStreaming)
      .map(([threadId]) => threadId)
  }

  /** Stops every turn cleanly so the session files stay valid. */
  async abortAll(): Promise<void> {
    await Promise.all(
      [...this.#threads.values()].map((thread) =>
        thread.session.abort().catch(() => undefined),
      ),
    )
  }

  /** The pi session file backing a thread — the transcript's real home. */
  sessionFile(threadId: string): string | undefined {
    return this.#threads.get(threadId)?.session.sessionFile
  }

  async #createThread(workspaceId: string): Promise<string> {
    const cwd = this.#workspaces.pathOf(workspaceId)
    const handle: ThreadHandle = { threadId: '' }

    const session = await this.#sessions.create(cwd, workspaceId, handle)
    handle.threadId = this.#adopt(session, cwd)
    return handle.threadId
  }

  /** Reopens a thread: its history is replayed as events before the live session
   *  is attached, so watching a thread and returning to it look the same. */
  async #openThread(threadId: string): Promise<void> {
    if (this.#threads.has(threadId)) return

    const { SessionManager } = await this.#sessions.load()
    const { path, cwd } = await this.#workspaces.locate(threadId)

    const sessionManager = SessionManager.open(path)
    // The active branch, not every entry in the file: a session that has been
    // rewound holds abandoned branches too, and replaying those would show the
    // user a conversation that never happened.
    for (const event of replayEntries(sessionManager.buildContextEntries())) {
      this.#emit(threadId, event)
    }

    // The thread id is already known here, unlike on creation.
    const workspaceId = this.#workspaces.idForPath(cwd)
    const session = await this.#sessions.open(cwd, workspaceId, sessionManager, threadId)
    this.#adopt(session, cwd)
  }

  /** Takes ownership of a session: binds its tools, wires its events, and files
   *  it under pi's own session id so the thread survives a relaunch. */
  #adopt(session: AgentSession, cwd: string): string {
    const threadId = session.sessionId
    const translator = new PiTranslator(() => session.getSessionStats().contextUsage?.contextWindow)
    const unsubscribe = session.subscribe((event) => {
      for (const translated of translator.translate(event)) this.#emit(threadId, translated)
      if (event.type === 'turn_end') this.#emitUsage(threadId, session)
      if (event.type === 'queue_update') this.#steers.sync(threadId, event.steering)
    })

    this.#threads.set(threadId, { session, unsubscribe, prompts: 0 })
    if (session.sessionFile) {
      this.#workspaces.remember(threadId, { path: session.sessionFile, cwd })
    }
    return threadId
  }

  #startTurn(threadId: string, text: string): void {
    const thread = this.#thread(threadId)
    const { session } = thread
    thread.lastPrompt = text
    thread.prompts += 1
    this.#emit(threadId, { kind: 'user-message', id: `user-${thread.prompts}`, text })

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

  /** Queues text for the running turn, or sends it as a prompt if nothing is
   *  running — the composer never has to know which case it is in. */
  async #steer(threadId: string, text: string): Promise<string> {
    const { session } = this.#thread(threadId)

    if (!session.isStreaming) {
      this.#startTurn(threadId, text)
      return ''
    }

    const steerId = this.#steers.add(threadId, text)
    await session.steer(text)
    return steerId
  }

  /** Rewinds the conversation to a checkpoint — and only the conversation.
   *
   *  pi navigates within the session tree, so the abandoned branch is still on
   *  disk and nothing on the filesystem is touched. That is the honest promise
   *  the confirm dialog makes: your files keep their later edits. */
  async #restore(threadId: string, checkpointId: string): Promise<void> {
    const { session } = this.#thread(threadId)

    const result = await session.navigateTree(checkpointId)
    if (result.cancelled) return

    // The conversation changed shape, so the thread is rebuilt rather than
    // appended to.
    this.#emit(threadId, { kind: 'thread-reset' })
    // The active branch as pi would send it to the model — which is exactly the
    // conversation the user should now see.
    for (const event of replayEntries(session.sessionManager.buildContextEntries())) {
      this.#emit(threadId, event)
    }
  }

  /** Asks pi to compact. Progress and outcome both arrive as session events, so
   *  a refusal ("nothing to compact") is already reported by the time this
   *  rejects — and it is not a thread failure. */
  async #compact(threadId: string): Promise<void> {
    try {
      await this.#thread(threadId).session.compact()
    } catch {
      // Already surfaced by the translator's `compaction_end` handling.
    }
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
    this.#steers.forget(threadId)
    thread.session.dispose()
    this.#threads.delete(threadId)
  }
}
