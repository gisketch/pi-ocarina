import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type {
  CommandName,
  CommandParams,
  CommandResult,
  EmitEvent,
  SessionDriver,
} from '../../shared/protocol'
import type { AttachmentRef } from '../../shared/vocabulary'
import type { CatalogStore } from '../catalog-store'
import { describeAttachments, readImages } from './attachments'
import { ApprovalGate } from './approvals'
import { ModelControl } from './model-control'
import { WorkspaceQueries } from './queries'
import { PiTranslator } from './pi-translate'
import { replayEntries } from './replay'
import { SessionFactory, type ModelRef, type ThreadHandle } from './session-factory'
import { SteerQueue } from './steering'
import { ThreadRegistry } from './thread-registry'
import { WorkspaceService } from './workspaces'

export type { ModelRef } from './session-factory'

export interface PiDriverOptions {
  emit: EmitEvent
  catalog: CatalogStore
  /** Overrides pi's configured default. Left unset, pi chooses — which is the
   *  product decision: provider and model live in pi's config, not ours. */
  model?: ModelRef
}

/** Hosts pi `AgentSession`s in the main process, one per open thread.
 *
 *  Everything pi-shaped stops here: the driver speaks pi inwards and the shared
 *  protocol outwards, so nothing above it needs to change when pi does. */
export class PiDriver implements SessionDriver {
  readonly kind = 'pi'

  readonly #threads: ThreadRegistry
  readonly #emit: EmitEvent
  readonly #workspaces: WorkspaceService
  readonly #approvals: ApprovalGate
  readonly #catalog: CatalogStore
  readonly #sessions: SessionFactory
  readonly #steers: SteerQueue
  readonly #models: ModelControl
  readonly #queries: WorkspaceQueries

  constructor({ emit, catalog, model }: PiDriverOptions) {
    this.#emit = emit
    this.#catalog = catalog
    this.#approvals = new ApprovalGate(emit, catalog)
    this.#steers = new SteerQueue(emit)
    this.#sessions = new SessionFactory(this.#approvals, model)
    this.#models = new ModelControl(this.#sessions)
    this.#workspaces = new WorkspaceService(catalog, () => this.#sessions.load())
    this.#queries = new WorkspaceQueries(this.#workspaces, this.#catalog, this.#models)
    this.#threads = new ThreadRegistry((threadId) => {
      // Anything waiting on an answer is released rather than left hanging.
      this.#approvals.abandon(threadId)
      this.#steers.forget(threadId)
    })
  }

  async execute<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<CommandResult<N>> {
    // Workspace-scoped commands touch no thread, so they answer first.
    const answered = await this.#queries.handle(name, params)
    if (answered) return answered.result as CommandResult<N>

    switch (name) {
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
        const { threadId, text, attachments } = params as CommandParams<'prompt'>
        await this.#startTurn(threadId, text, attachments ?? [])
        return { ok: true } as CommandResult<N>
      }

      case 'resolveApproval': {
        const { approvalId, outcome } = params as CommandParams<'resolveApproval'>
        this.#approvals.resolve(approvalId, outcome)
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

      case 'setModel': {
        const { threadId, provider, model } = params as CommandParams<'setModel'>
        await this.#models.set(this.#threads.get(threadId).session, provider, model)
        this.#models.announce(threadId, this.#threads.find(threadId)?.session, this.#emit)
        return { ok: true } as CommandResult<N>
      }

      case 'setReasoning': {
        const { threadId, reasoning } = params as CommandParams<'setReasoning'>
        this.#models.setReasoning(this.#threads.get(threadId).session, reasoning)
        this.#models.announce(threadId, this.#threads.find(threadId)?.session, this.#emit)
        return { ok: true } as CommandResult<N>
      }

      case 'retryTurn': {
        const { threadId } = params as CommandParams<'retryTurn'>
        const { lastPrompt } = this.#threads.get(threadId)
        // Nothing to retry is not an error; the UI simply offered a button it
        // did not need to.
        if (lastPrompt) void this.#startTurn(threadId, lastPrompt)
        return { ok: true } as CommandResult<N>
      }

      case 'cancelTurn': {
        const { threadId } = params as CommandParams<'cancelTurn'>
        const thread = this.#threads.get(threadId)
        await thread.session.abort()
        // pi reports nothing for the calls it abandoned, so the rows are
        // settled here before the thread is called idle.
        for (const event of thread.translator.abandonOpenTools()) this.#emit(threadId, event)
        this.#emit(threadId, { kind: 'thread-state', state: 'idle' })
        return { ok: true } as CommandResult<N>
      }

      case 'archiveThread': {
        const { threadId } = params as CommandParams<'archiveThread'>
        this.#threads.close(threadId)
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
    this.#threads.closeAll()
  }

  runningThreads(): string[] {
    return this.#threads.running()
  }

  abortAll(): Promise<void> {
    return this.#threads.abortAll()
  }

  /** The pi session file backing a thread — the transcript's real home. */
  sessionFile(threadId: string): string | undefined {
    return this.#threads.find(threadId)?.session.sessionFile
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
    // Already open. That is the normal path for a thread the renderer just
    // created: it subscribes only once `createThread` has returned, so the
    // model and usage announced while the session was being adopted were
    // emitted before anyone was listening. Saying them again costs two events
    // and is the difference between a real model name and "pi default".
    if (this.#threads.has(threadId)) {
      const session = this.#threads.find(threadId)?.session
      this.#models.announce(threadId, session, this.#emit)
      if (session) this.#emitUsage(threadId, session)
      return
    }

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
    const translator = new PiTranslator(
      () => session.getSessionStats().contextUsage?.contextWindow,
      (toolCallId) => this.#approvals.takeBlocked(toolCallId),
    )
    const unsubscribe = session.subscribe((event) => {
      for (const translated of translator.translate(event)) this.#emit(threadId, translated)
      if (event.type === 'turn_end') this.#emitUsage(threadId, session)
      if (event.type === 'queue_update') this.#steers.sync(threadId, event.steering)
    })

    this.#threads.add(threadId, { session, unsubscribe, translator, prompts: 0 })
    this.#models.announce(threadId, this.#threads.find(threadId)?.session, this.#emit)
    // A reopened thread carries its whole history's accounting; without this
    // the meter would read zero until the thread's next turn ended.
    this.#emitUsage(threadId, session)
    if (session.sessionFile) {
      this.#workspaces.remember(threadId, { path: session.sessionFile, cwd })
    }
    return threadId
  }

  /** Starts a turn.
   *
   *  Attachments are resolved before the turn begins: images become bytes pi
   *  can see, and everything else is named in the message for pi to open with
   *  its read tool — pi 0.84 takes text and images, and nothing else. */
  async #startTurn(threadId: string, text: string, attachments: AttachmentRef[] = []): Promise<void> {
    const thread = this.#threads.get(threadId)
    const { session } = thread
    const images = await readImages(attachments)
    const prompt = text + describeAttachments(attachments)

    thread.lastPrompt = text
    thread.prompts += 1
    this.#emit(threadId, { kind: 'user-message', id: `user-${thread.prompts}`, text: prompt })

    // Deliberately not awaited: a turn runs for minutes and the caller's IPC
    // reply must not wait for it. Progress and failure both arrive as events.
    void session.prompt(prompt, images.length > 0 ? { images } : undefined).catch((error: unknown) => {
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
    const { session } = this.#threads.get(threadId)

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
    const { session } = this.#threads.get(threadId)

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
      await this.#threads.get(threadId).session.compact()
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


}
