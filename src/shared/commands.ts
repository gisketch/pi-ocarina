/** Every command the UI can issue, with its parameter and result shapes.
 *
 *  Split from `protocol.ts` so the events flowing up and the commands flowing
 *  down are two files rather than one long one. `protocol.ts` re-exports these,
 *  so nothing that imports them had to move. */

import type { LspServerState } from './lsp'
import type { ThreadId } from './thread-id'
import type { ChatMode } from './chat-modes'
import type { ProjectSurface } from './project-surface'
import type { PermissionLevel } from './permissions'
import type {
  AgentRole,
  ApprovalOutcome,
  AskAnswer,
  AttachmentRef,
  ReasoningLevel,
} from './vocabulary'
import type { GitStatus } from './git-protocol'
import type {
  ChangedFile,
  ModelSummary,
  SearchHit,
  ThreadSummary,
  WorkspaceSummary,
} from './protocol'


/** Commands the UI can issue, with their parameter and result shapes. */
export interface SessionCommands {
  listWorkspaces: { params: Record<string, never>; result: { workspaces: WorkspaceSummary[] } }
  pinWorkspace: { params: { path: string }; result: { workspace: WorkspaceSummary } }
  unpinWorkspace: { params: { workspaceId: string }; result: { ok: true } }
  /** `includeArchived` lists closed threads too — the dashboard's history.
   *  Off, the listing is the strip's: what "closed" hides stays hidden. */
  listThreads: {
    params: { workspaceId: string; includeArchived?: boolean }
    result: { threads: ThreadSummary[] }
  }
  /** `worktree` runs the thread in its own checkout on a new branch, made
   *  before the session starts — pi is given a working directory once, so this
   *  cannot be decided later. A failure rejects, leaving no thread behind. */
  createThread: {
    params: { workspaceId: string; title?: string; worktree?: { branch: string } }
    result: { threadId: ThreadId }
  }
  openThread: { params: { threadId: ThreadId }; result: { ok: true } }
  /** What this workspace loaded: its commands, its skills, its instruction
   *  files, and anything that failed to load. Read-only — the app shows what
   *  the project imposed and never authors it. */
  /** The voices on offer, and the one this thread is using. */
  listModes: {
    /** Absent for a column with no session behind it — the placeholder. There
     *  is no override to look up, so the answer is the default the thread its
     *  first message creates will be born with. */
    params: { threadId?: ThreadId }
    result: { modes: ChatMode[]; current?: string; overridden: boolean; fallbackMode?: string }
  }
  /** This thread's own voice. Session-scoped: never written to the catalog, and
   *  gone after a relaunch. `undefined` returns the thread to the default. */
  setThreadMode: { params: { threadId: ThreadId; modeId?: string }; result: { ok: true } }
  /** The voice every thread starts on. `undefined` is "normal". */
  /** `threadId` names the thread to re-read afterwards, so the change is heard
   *  in the column the reader is looking at. Others keep the voice they were
   *  built with until they are reopened. */
  setDefaultMode: { params: { modeId?: string; threadId?: ThreadId }; result: { ok: true } }
  saveMode: { params: { mode: ChatMode }; result: { mode: ChatMode } }
  deleteMode: { params: { modeId: string }; result: { ok: true } }
  /** Keyed on the workspace, because that is what a surface is: every field of
   *  it comes from a folder, pi's configuration directory and this app's own
   *  resources. `threadId` narrows it to what one open thread actually loaded,
   *  and is absent for a column with no session — the placeholder and the
   *  shell, and every column in a workspace whose threads are all closed. */
  projectSurface: {
    params: { workspaceId: string; threadId?: ThreadId }
    result: { surface: ProjectSurface }
  }
  /** Re-reads those files from disk.
   *
   *  Refused while a turn is running rather than queued. pi builds the system
   *  prompt per request, so a reload landing mid-turn would leave one turn
   *  running under different instructions than the turn before it, with nothing
   *  in the transcript saying so. A queued one would land at a moment nobody
   *  chose. */
  reloadProject: {
    params: { threadId: ThreadId }
    result: { surface: ProjectSurface; reloaded: true } | { reloaded: false; because: string }
  }
  /** Names a thread. Written into pi's session file (`session_info`), so it is
   *  the same name the listing reads back — no second store to disagree. A
   *  hand-given name is final: the auto-titler never overwrites one. */
  renameThread: { params: { threadId: ThreadId; title: string }; result: { ok: true } }
  /** Hides a thread from its workspace's strip. The session file is untouched. */
  archiveThread: { params: { threadId: ThreadId }; result: { ok: true } }
  /** Brings a closed thread back — what jumping to it from search does. */
  unarchiveThread: { params: { threadId: ThreadId }; result: { ok: true } }
  prompt: {
    params: { threadId: ThreadId; text: string; attachments?: AttachmentRef[] }
    result: { ok: true }
  }
  steer: { params: { threadId: ThreadId; text: string }; result: { steerId: string } }
  cancelQueuedSteer: { params: { threadId: ThreadId; steerId: string }; result: { ok: true } }
  /** Every answer at once. Never one question at a time: a model handed answer
   *  one while the reader is still on question two is acting on half a
   *  decision. */
  answerAsk: {
    params: { threadId: ThreadId; askId: string; answers: AskAnswer[] }
    result: { ok: true }
  }
  resolveApproval: {
    params: { threadId: ThreadId; approvalId: string; outcome: ApprovalOutcome }
    result: { ok: true }
  }
  listApprovalRules: { params: { workspaceId: string }; result: { rules: string[] } }
  /** The roles a child agent can be spawned as, and the names it may borrow.
   *  Both live in the catalog, which only main writes. */
  listRoles: { params: Record<string, never>; result: { roles: AgentRole[]; names: string[] } }
  /** `ok: false` when the name is already another role's — a spawn names a
   *  role by name, so two of them is not a state the store can hold. */
  saveRole: { params: { role: AgentRole }; result: { ok: boolean; reason?: string } }
  deleteRole: { params: { roleId: string }; result: { ok: true } }
  setNamePool: { params: { names: string[] }; result: { ok: true } }
  /** What the Workspace Settings screen draws: every server worth showing for
   *  this workspace, and whether it is plausible, installed, enabled, running
   *  or degraded. Detection happens in main, which is the only side that may
   *  look at the disk or at PATH. */
  workspaceLsp: {
    params: { workspaceId: string }
    result: { on: boolean; servers: LspServerState[] }
  }
  /** Writes clipboard image bytes to a file main owns, and describes it as an
   *  attachment. A screenshot has no path, so this is the only way one can
   *  travel — and the renderer still never opens a file. */
  stageImage: {
    params: { data: string; mime: string }
    result: { attachment: AttachmentRef | null }
  }
  /** How much this workspace asks before a tool runs, and where that came
   *  from. `level` is what is in force; `workspace` and `global` say which of
   *  them decided it, so the screen can show "inherit" honestly. */
  workspacePermission: {
    params: { workspaceId: string }
    result: { level: PermissionLevel; workspace?: PermissionLevel; global: PermissionLevel }
  }
  /** Sets a workspace's own level, or clears it back to the global default.
   *  Enforcement is main's; this only records the choice. */
  setWorkspacePermission: {
    params: { workspaceId: string; level?: PermissionLevel }
    result: { ok: true }
  }
  /** One thread's own level, for as long as the app is open. Never stored: a
   *  window reopening days later at full access, because of a decision made
   *  once for one command, is the surprise the levels exist to remove. */
  setThreadPermission: {
    params: { threadId: ThreadId; workspaceId: string; level?: PermissionLevel }
    result: { level: PermissionLevel; thread?: PermissionLevel }
  }
  threadPermission: {
    params: { threadId: ThreadId; workspaceId: string }
    result: { level: PermissionLevel; thread?: PermissionLevel }
  }
  /** Switches LSP for a workspace, or one server within it. Takes effect on the
   *  next call the agent makes; a running server it turns off is stopped. */
  setWorkspaceLsp: {
    params: { workspaceId: string; on?: boolean; serverId?: string; enabled?: boolean }
    result: { ok: true }
  }
  revokeApprovalRule: { params: { workspaceId: string; rule: string }; result: { ok: true } }
  cancelTurn: { params: { threadId: ThreadId }; result: { ok: true } }
  /** Stops one child agent. Its siblings keep running, and the turn stays open
   *  — that is the difference between this and `cancelTurn`. */
  cancelAgent: { params: { threadId: ThreadId; agentId: string }; result: { ok: boolean } }
  retryTurn: { params: { threadId: ThreadId }; result: { ok: true } }
  restoreCheckpoint: {
    params: { threadId: ThreadId; checkpointId: string }
    result: { threadId: ThreadId }
  }
  /** Copies a thread at a checkpoint into a new thread. The original is
   *  untouched; the copy carries the history up to the checkpoint, shares the
   *  parent's folder, and waits for a prompt. `title` is the copy's name —
   *  the caller says `Fork - <parent>`, the backend does not invent it. */
  forkThread: {
    params: { threadId: ThreadId; checkpointId: string; title: string }
    result: { threadId: ThreadId }
  }
  compact: { params: { threadId: ThreadId }; result: { ok: true } }
  /** Paths the @-mention picker offers, relative to the workspace. */
  listFiles: { params: { workspaceId: string }; result: { files: string[] } }
  /** Searches thread titles and transcripts. `complete` is false when the time
   *  budget ran out — the result then says so rather than implying it saw
   *  every thread. */
  searchThreads: {
    params: { query: string }
    result: { hits: SearchHit[]; complete: boolean }
  }
  /** Every file this thread changed, and the change as one diff each.
   *
   *  The span is the thread's whole life: the file as it was before the thread
   *  first touched it, against the file as it is now. The ledger answers the
   *  other question — what each call did — and both come from the same
   *  snapshots through the same diff, so the two cannot disagree. */
  listChanges: { params: { threadId: ThreadId }; result: { files: ChangedFile[] } }
  /** What removing this thread's worktree would cost, or null when it has none.
   *  `commits` counts commits on its branch and nowhere else. */
  threadWorktree: {
    params: { threadId: ThreadId }
    result: { worktree: { branch: string; path: string; dirty: number; commits: number } | null }
  }
  /** Removes a thread's worktree. Refuses one holding commits outright — the
   *  commits are the work — and a dirty one unless `force` says the reader was
   *  asked and answered. */
  removeThreadWorktree: {
    params: { threadId: ThreadId; force?: boolean }
    result: { ok: boolean; reason?: string }
  }
  /** Every worktree this app made under a workspace, and what each holds. */
  listWorktrees: {
    params: { workspaceId: string }
    result: { worktrees: { branch: string; path: string; dirty: number; commits: number }[] }
  }
  /** Removes one of them by path. Same three rules the close path uses. */
  removeWorktree: {
    params: { workspaceId: string; path: string; force?: boolean }
    result: { ok: boolean; reason?: string }
  }
  /** The git state of the checkout a thread runs in, or null when the thread
   *  is not isolated — the workspace's own state is already published on the
   *  git channel, and answering with it here would let the two disagree. */
  threadGit: { params: { threadId: ThreadId }; result: { status: GitStatus | null } }
  listModels: { params: Record<string, never>; result: { models: ModelSummary[] } }
  setModel: {
    params: { threadId: ThreadId; provider: string; model: string }
    result: { ok: true }
  }
  setReasoning: { params: { threadId: ThreadId; reasoning: ReasoningLevel }; result: { ok: true } }
}

export type CommandName = keyof SessionCommands
export type CommandParams<N extends CommandName> = SessionCommands[N]['params']
export type CommandResult<N extends CommandName> = SessionCommands[N]['result']
