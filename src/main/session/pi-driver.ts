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
import { fleetFor, type AgentFleet } from './agent-wiring'
import { handleArchive } from './role-commands'
import { LspService } from '../lsp/service'
import { ModeControl } from './mode-commands'
import { handleStored, ownsStored, type StoredDeps } from './stored-commands'
import { openingDeps, storedDeps, type DriverParts } from './driver-deps'
import { applyThreadDefaults } from './thread-defaults'
import type { HookEntry, RuleEntry, TitleSettings } from '../../shared/config-file'
import { StagedImages } from './staged-images'
import { autoTitle, renameThread, wantsTitle } from './thread-title'
import { compactThread, restoreCheckpoint, startTurn, steerTurn } from './turn-ops'
import { forkThread } from './fork-thread'
import { adoptSession, openThread, type OpenDeps } from './thread-open'
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
  readonly #lsp: LspService
  readonly #sessions: SessionFactory
  readonly #steers: SteerQueue
  readonly #models: ModelControl
  readonly #queries: WorkspaceQueries
  readonly #modes: ModeControl
  /** The reader's hooks, read from their configuration file. Supplied after
   *  construction: main reads the file once at launch, and a driver built
   *  before it simply has none. */
  #hooks: () => readonly HookEntry[] = () => []
  /** The reader's title settings, from the same file, the same way. */
  #titles: () => TitleSettings = () => ({})
  readonly #changes = new ChangeLog()
  readonly #staged = new StagedImages()
  readonly #asks: AskGate
  readonly #fleet: AgentFleet

  constructor({ emit, catalog, model, onUnpin }: PiDriverOptions) {
    this.#emit = emit
    this.#catalog = catalog
    this.#lsp = new LspService(catalog)
    this.#approvals = new ApprovalGate(emit, catalog, catalog)
    this.#asks = new AskGate(emit)
    this.#steers = new SteerQueue(emit)
    this.#sessions = new SessionFactory(this.#approvals, this.#asks, model)
    this.#fleet = fleetFor(this.#sessions, emit, catalog, (toolCallId) =>
      this.#approvals.takeBlocked(toolCallId),
    )
    this.#sessions.enableLsp((workspaceId, cwd) => this.#lsp.sessionDeps(workspaceId, cwd))
    this.#modes = new ModeControl(this.#catalog)
    this.#sessions.enableModes((threadId) => this.#modes.promptFor(threadId))
    this.#models = new ModelControl(this.#sessions)
    this.#workspaces = new WorkspaceService(catalog, () => this.#sessions.load())
    this.#queries = new WorkspaceQueries(this.#workspaces, this.#catalog, this.#models, onUnpin)
    this.#threads = new ThreadRegistry((threadId) => {
      // Anything waiting on an answer is released rather than left hanging.
      this.#approvals.abandon(threadId)
      this.#asks.end(threadId, 'thread closed')
      // A thread with no column has nobody watching its children.
      this.#fleet.cancelThread(threadId)
      this.#fleet.forget(threadId)
      this.#steers.forget(threadId)
      this.#modes.forget(threadId)
      this.#changes.forget(threadId)
    })
  }

  /** Hands the driver the reader's hooks. Called once, after main has read
   *  their configuration file. Absent means no hooks, which is what a driver in
   *  a test has and what most readers have. */
  useHooks(hooks: () => readonly HookEntry[]): void {
    this.#hooks = hooks
  }

  /** Hands the approval gate the reader's written rules. */
  useRules(rules: () => readonly RuleEntry[]): void {
    this.#approvals.useRules(rules)
  }

  /** Hands the titler the reader's settings. Absent means on, cheapest. */
  useTitles(titles: () => TitleSettings): void {
    this.#titles = titles
  }

  async execute<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<CommandResult<N>> {
    // Workspace-scoped commands touch no thread, so they answer first.
    const answered = await this.#queries.handle(name, params)
    if (answered) return answered.result as CommandResult<N>

    // Then everything that reads or writes stored state rather than running a
    // turn. What is left below is the agent itself.
    if (ownsStored(name)) {
      return (await handleStored(this.#stored(), name, params)) as CommandResult<N>
    }

    switch (name) {
      case 'createThread': {
        const { workspaceId, worktree } = params as CommandParams<'createThread'>
        const threadId = await startThread(
          { workspaces: this.#workspaces, sessions: this.#sessions },
          workspaceId,
          worktree,
          (session, cwd, branch) => this.#adopt(session, cwd, branch),
        )
        await this.#applyDefaults(threadId)
        return { threadId } as CommandResult<N>
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
        const thread = this.#threads.get(threadId)
        await startTurn(this.#emit, threadId, thread, text, attachments ?? [])
        // The titler rides beside the turn, never in front of it: the first
        // message of a nameless session goes to a cheap model whose one job
        // is the header line, and a failure there is silence.
        if (wantsTitle(thread)) {
          const cwd = this.#workspaces.cwdOf(threadId)
          if (cwd) {
            void autoTitle(
              { sessions: this.#sessions, emit: this.#emit, titles: this.#titles },
              threadId,
              thread,
              cwd,
              text,
            )
          }
        }
        return { ok: true } as CommandResult<N>
      }

      case 'renameThread': {
        const { threadId, title } = params as CommandParams<'renameThread'>
        renameThread(this.#emit, threadId, this.#threads.get(threadId), title)
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

      case 'forkThread': {
        const { threadId, checkpointId, title } = params as CommandParams<'forkThread'>
        const parent = this.#threads.get(threadId)
        const forked = await forkThread(this.#parts(), threadId, parent, checkpointId, title)
        return forked as CommandResult<N>
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

      case 'setModel':
      case 'setReasoning': {
        const { threadId } = params as CommandParams<'setModel'>
        await this.#models.apply(this.#threads.get(threadId).session, name, params)
        // Announced from the session rather than echoed back: what pi actually
        // took is the only honest thing to put in the chip.
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

      case 'cancelAgent': {
        const { agentId } = params as CommandParams<'cancelAgent'>
        // Deliberately not `cancelTurn`: the turn stays open, the siblings keep
        // running, and the fleet settles this one child as `cancelled`.
        return { ok: this.#fleet.cancel(agentId) } as CommandResult<N>
      }

      case 'stageImage': {
        const { data, mime } = params as CommandParams<'stageImage'>
        return { attachment: await this.#staged.stage(data, mime) } as CommandResult<N>
      }

      case 'archiveThread': {
        // Closing first: a thread with no column has nobody watching whatever
        // it is still doing.
        this.#threads.close((params as CommandParams<'archiveThread'>).threadId)
        return (await handleArchive(this.#workspaces, name, params)) as CommandResult<N>
      }

      case 'unarchiveThread':
        return (await handleArchive(this.#workspaces, name, params)) as CommandResult<N>

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
    await this.#lsp.stopAll()
    await this.#staged.cleanup()
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

  /** Reopens a thread. The work is `thread-open.ts`; what stays here is the
   *  driver's own collaborators, gathered once. */
  async #openThread(threadId: string): Promise<void> {
    await openThread(this.#opening(), threadId)
  }

  /** Puts a new thread on the model and reasoning level the reader chose.
   *
   *  At creation and never afterwards: a default that reapplied itself would
   *  undo the choice a reader made for one thread, which is the opposite of
   *  what a default is for. A model pi no longer has is not an error worth
   *  failing a new thread over — the thread opens on pi's own choice and the
   *  reader sees which one in the title bar.
   */
  async #applyDefaults(threadId: string): Promise<void> {
    await applyThreadDefaults(
      { catalog: this.#catalog, models: this.#models, emit: this.#emit },
      threadId,
      this.#threads.find(threadId)?.session,
    )
  }

  #adopt(session: AgentSession, cwd: string, branch: string | null = null): string {
    return adoptSession(this.#opening(), session, cwd, branch)
  }

  #stored(): StoredDeps {
    return storedDeps(this.#parts())
  }

  #opening(): OpenDeps {
    return openingDeps(this.#parts())
  }

  #parts(): DriverParts {
    return {
      emit: this.#emit,
      threads: this.#threads,
      fleet: this.#fleet,
      models: this.#models,
      sessions: this.#sessions,
      workspaces: this.#workspaces,
      changes: this.#changes,
      steers: this.#steers,
      approvals: this.#approvals,
      staged: this.#staged,
      catalog: this.#catalog,
      lsp: this.#lsp,
      modes: this.#modes,
      hooks: this.#hooks,
    }
  }
}
