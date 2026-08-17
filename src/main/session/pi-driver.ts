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
import { dropWorktree, threadGitStatus, worktreeOf } from './thread-worktree'
import { ApprovalGate } from './approvals'
import { ChangeLog } from './change-log'
import { changedFiles } from './changed-files'
import { ModelControl } from './model-control'
import { WorkspaceQueries } from './queries'
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

  constructor({ emit, catalog, model, onUnpin }: PiDriverOptions) {
    this.#emit = emit
    this.#catalog = catalog
    this.#approvals = new ApprovalGate(emit, catalog)
    this.#steers = new SteerQueue(emit)
    this.#sessions = new SessionFactory(this.#approvals, model)
    this.#models = new ModelControl(this.#sessions)
    this.#workspaces = new WorkspaceService(catalog, () => this.#sessions.load())
    this.#queries = new WorkspaceQueries(this.#workspaces, this.#catalog, this.#models, onUnpin)
    this.#threads = new ThreadRegistry((threadId) => {
      // Anything waiting on an answer is released rather than left hanging.
      this.#approvals.abandon(threadId)
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
        return { threadId: await this.#createThread(workspaceId, worktree) } as CommandResult<N>
      }

      case 'openThread': {
        const { threadId } = params as CommandParams<'openThread'>
        await this.#openThread(threadId)
        return { ok: true } as CommandResult<N>
      }

      case 'prompt': {
        const { threadId, text, attachments } = params as CommandParams<'prompt'>
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

      case 'threadWorktree': {
        const { threadId } = params as CommandParams<'threadWorktree'>
        return { worktree: await worktreeOf(this.#workspaces, threadId) } as CommandResult<N>
      }

      case 'removeThreadWorktree': {
        const { threadId, force } = params as CommandParams<'removeThreadWorktree'>
        return (await dropWorktree(this.#workspaces, threadId, force ?? false)) as CommandResult<N>
      }

      case 'threadGit': {
        const { threadId } = params as CommandParams<'threadGit'>
        return { status: await threadGitStatus(this.#workspaces, threadId) } as CommandResult<N>
      }

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

  async #createThread(workspaceId: string, worktree?: { branch: string }): Promise<string> {
    // The checkout first: pi is given a working directory when the session
    // starts, so a worktree that fails to appear must stop the creation rather
    // than leave a thread running in the tree it was meant to keep out of.
    const { cwd, branch } = await this.#workspaces.cwdForNewThread(workspaceId, worktree)
    const handle: ThreadHandle = { threadId: '' }

    const session = await this.#sessions.create(cwd, workspaceId, handle)
    handle.threadId = this.#adopt(session, cwd, branch)
    return handle.threadId
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
    const { path, cwd } = await this.#workspaces.locate(threadId)

    const sessionManager = SessionManager.open(path)
    // The active branch, not every entry in the file: a session that has been
    // rewound holds abandoned branches too, and replaying those would show the
    // user a conversation that never happened.
    replayInto(this.#emit, threadId, sessionManager.buildContextEntries())

    // The thread id is already known here, unlike on creation.
    const workspaceId = this.#workspaces.idForPath(cwd)
    const session = await this.#sessions.open(cwd, workspaceId, sessionManager, threadId)
    // `locate` filled this in from the listing, so a reopened thread keeps the
    // branch it was created on across a restart.
    this.#adopt(session, cwd, this.#workspaces.branchOf(threadId))
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
