import type { AgentSession, SessionEntry } from '@earendil-works/pi-coding-agent'
import type {
  CommandName,
  CommandParams,
  CommandResult,
  EmitEvent,
  SessionDriver,
} from '../../shared/protocol'
import type { AttachmentRef } from '../../shared/vocabulary'
import type { CatalogStore } from '../catalog-store'
import { startThread } from './start-thread'
import { worktreeCommand } from './worktree-commands'
import { ApprovalGate } from './approvals'
import { AskGate } from './ask-gate'
import { ChangeLog } from './change-log'
import { changedFiles } from './changed-files'
import { ModelControl } from './model-control'
import { WorkspaceQueries } from './queries'
import { AgentFleet } from './agent-fleet'
import { PiTranslator } from './pi-translate'
import { emitUsage, replayInto } from './session-report'
import { compactThread, restoreCheckpoint, startTurn, steerTurn } from './turn-ops'
import { subscribeSession } from './session-events'
import { SessionFactory, type ModelRef, type ThreadHandle } from './session-factory'
import { SteerQueue } from './steering'
import { ThreadRegistry } from './thread-registry'
import { WorkspaceService } from './workspaces'

export type { ModelRef } from './session-factory'

export interface PiDriverOptions {
  emit: EmitEvent
  catalog: CatalogStore
  /** Told when a workspace is unpinned, so its shell can be stopped with it. */
  onUnpin?: (workspaceId: string) => void
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
  readonly #changes = new ChangeLog()
  readonly #asks: AskGate
  readonly #fleet: AgentFleet

  constructor({ emit, catalog, model, onUnpin }: PiDriverOptions) {
    this.#emit = emit
    this.#catalog = catalog
    this.#approvals = new ApprovalGate(emit, catalog)
    this.#asks = new AskGate(emit)
    this.#steers = new SteerQueue(emit)
    this.#sessions = new SessionFactory(this.#approvals, this.#asks, model)
    // The fleet is built from the factory and then handed back to it: a child
    // is a session, and a session may spawn children, so the two are mutually
    // dependent and one of them has to be wired after construction.
    this.#fleet = new AgentFleet(this.#sessions, emit)
    this.#sessions.enableSpawning({
      fleet: this.#fleet,
      roles: () => catalog.roles(),
      names: () => catalog.namePool(),
    })
    this.#models = new ModelControl(this.#sessions)
    this.#workspaces = new WorkspaceService(catalog, () => this.#sessions.load())
    this.#queries = new WorkspaceQueries(this.#workspaces, this.#catalog, this.#models, onUnpin)
    this.#threads = new ThreadRegistry((threadId) => {
      // Anything waiting on an answer is released rather than left hanging.
      this.#approvals.abandon(threadId)
      this.#asks.end(threadId, 'thread closed')
      // A thread with no column has nobody watching its children.
      this.#fleet.cancelThread(threadId)
      this.#steers.forget(threadId)
      this.#changes.forget(threadId)
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
        const { workspaceId, worktree } = params as CommandParams<'createThread'>
        return {
          threadId: await startThread(
            { workspaces: this.#workspaces, sessions: this.#sessions },
            workspaceId,
            worktree,
            (session, cwd, branch) => this.#adopt(session, cwd, branch),
          ),
        } as CommandResult<N>
      }

      case 'openThread': {
        const { threadId } = params as CommandParams<'openThread'>
        await this.#openThread(threadId)
        return { ok: true } as CommandResult<N>
      }

      case 'prompt': {
        const { threadId, text, attachments } = params as CommandParams<'prompt'>
        // Prose instead of a choice means none of the above. The question ends
        // carrying what was said, and the message goes on as an ordinary one.
        this.#asks.cancel(threadId, text)
        await startTurn(this.#emit, threadId, this.#threads.get(threadId), text, attachments ?? [])
        return { ok: true } as CommandResult<N>
      }

      case 'resolveApproval': {
        const { approvalId, outcome } = params as CommandParams<'resolveApproval'>
        this.#approvals.resolve(approvalId, outcome)
        return { ok: true } as CommandResult<N>
      }

      case 'steer': {
        const { threadId, text } = params as CommandParams<'steer'>
        this.#asks.cancel(threadId, text)
        return { steerId: await steerTurn(this.#emit, this.#steers, threadId, this.#threads.get(threadId), text) } as CommandResult<N>
      }

      case 'cancelQueuedSteer': {
        const { threadId, steerId } = params as CommandParams<'cancelQueuedSteer'>
        this.#steers.cancel(threadId, steerId)
        return { ok: true } as CommandResult<N>
      }

      case 'restoreCheckpoint': {
        const { threadId, checkpointId } = params as CommandParams<'restoreCheckpoint'>
        await restoreCheckpoint(this.#emit, threadId, this.#threads.get(threadId), checkpointId)
        return { threadId } as CommandResult<N>
      }

      case 'threadWorktree':
      case 'removeThreadWorktree':
      case 'listWorktrees':
      case 'removeWorktree':
      case 'threadGit':
        return (await worktreeCommand(this.#workspaces, name, params)) as CommandResult<N>

      case 'listChanges': {
        const { threadId } = params as CommandParams<'listChanges'>
        return {
          files: changedFiles(this.#changes.changes(threadId), this.#workspaces.cwdOf(threadId)),
        } as CommandResult<N>
      }

      case 'compact': {
        const { threadId } = params as CommandParams<'compact'>
        await compactThread(this.#threads.get(threadId))
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
        if (lastPrompt) void startTurn(this.#emit, threadId, this.#threads.get(threadId), lastPrompt)
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
        await this.#workspaces.setArchived(threadId, true)
        return { ok: true } as CommandResult<N>
      }

      case 'unarchiveThread': {
        const { threadId } = params as CommandParams<'unarchiveThread'>
        await this.#workspaces.setArchived(threadId, false)
        return { ok: true } as CommandResult<N>
      }

      case 'answerAsk': {
        const { threadId, askId, answers } = params as CommandParams<'answerAsk'>
        this.#asks.answer(threadId, askId, answers)
        return { ok: true } as CommandResult<N>
      }

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

  /** Where a thread runs, when that is not its workspace's own folder. What
   *  the git pipeline asks before it reads or commits anything for a thread. */
  threadCwd(threadId: string): string | null {
    return this.#workspaces.branchOf(threadId) === null
      ? null
      : (this.#workspaces.cwdOf(threadId) ?? null)
  }

  /** The branch a thread is isolated on, or null. */
  threadBranch(threadId: string): string | null {
    return this.#workspaces.branchOf(threadId)
  }

  /** The pi session file backing a thread — the transcript's real home. */
  sessionFile(threadId: string): string | undefined {
    return this.#threads.find(threadId)?.session.sessionFile
  }

  /** Reopens a thread: its history is replayed as events before the live session
   *  is attached, so watching a thread and returning to it look the same. */
  async #openThread(threadId: string): Promise<void> {
    // Already open in this process. Two different callers land here and both
    // need the same answer.
    //
    // One is a thread the renderer just created: it subscribes only once
    // `createThread` has returned, so the model and usage announced while the
    // session was being adopted reached nobody.
    //
    // The other is a renderer that reloaded. Main keeps its sessions across a
    // window reload, so every thread is still open here while the renderer has
    // just lost everything it knew — and replying with only a model name left
    // it showing empty columns until the whole app was restarted.
    //
    // Replaying is right for both: a freshly created thread has no history, so
    // it costs nothing there.
    const open = this.#threads.find(threadId)
    if (open) {
      replayInto(this.#emit, threadId, open.session.sessionManager.buildContextEntries())
      // Replay ends by stating the thread from its history, which cannot know
      // about a turn that is still streaming — it would report `done` over a
      // turn still being written. Only this side knows, so it says so.
      if (open.session.isStreaming) this.#emit(threadId, { kind: 'thread-state', state: 'running' })
      this.#models.announce(threadId, open.session, this.#emit)
      emitUsage(this.#emit, threadId, open.session)
      return
    }

    const { SessionManager } = await this.#sessions.load()
    const location = await this.#workspaces.locate(threadId)
    const { path } = location
    // A thread whose worktree has been removed still has its transcript, and
    // must still open — in the workspace's own folder, since pi needs a
    // directory that is there. It stops being isolated at that moment, which is
    // what `branch` coming back null says.
    const { cwd, branch } = this.#workspaces.openableCwd(location)

    const sessionManager = SessionManager.open(path)
    // The active branch, not every entry in the file: a session that has been
    // rewound holds abandoned branches too, and replaying those would show the
    // user a conversation that never happened.
    replayInto(this.#emit, threadId, sessionManager.buildContextEntries())

    // The thread id is already known here, unlike on creation.
    const workspaceId = this.#workspaces.idForPath(cwd)
    const session = await this.#sessions.open(cwd, workspaceId, sessionManager, threadId)
    // `locate` filled the branch in from the listing, so a reopened thread
    // keeps the tree it was created in across a restart — unless that tree is
    // gone, in which case `openableCwd` has already said so.
    this.#adopt(session, cwd, branch)
  }

  /** Takes ownership of a session: binds its tools, wires its events, and files
   *  it under pi's own session id so the thread survives a relaunch. */
  #adopt(session: AgentSession, cwd: string, branch: string | null = null): string {
    const threadId = session.sessionId
    const translator = new PiTranslator(
      () => session.getSessionStats().contextUsage?.contextWindow,
      (toolCallId) => this.#approvals.takeBlocked(toolCallId),
    )
    const unsubscribe = subscribeSession({
      session,
      threadId,
      cwd,
      translator,
      emit: this.#emit,
      changes: this.#changes,
      steers: this.#steers,
    })

    this.#threads.add(threadId, { session, unsubscribe, translator, prompts: 0 })
    this.#models.announce(threadId, this.#threads.find(threadId)?.session, this.#emit)
    // A reopened thread carries its whole history's accounting; without this
    // the meter would read zero until the thread's next turn ended.
    emitUsage(this.#emit, threadId, session)
    if (session.sessionFile) {
      this.#workspaces.remember(threadId, { path: session.sessionFile, cwd, branch })
    }
    return threadId
  }

}
