/** The seam between the session backend and the UI.
 *
 *  Everything here is message-shaped and serialisable: no shared memory, no
 *  callbacks across the boundary. That is what lets a session move to a
 *  utilityProcess later without the renderer noticing. */

import type {
  ApprovalOutcome,
  AskAnswer,
  AskOutcome,
  AskQuestion,
  AttachmentRef,
  DiffLine,
  ReasoningLevel,
  ThreadRunState,
  ToolBody,
  ToolKind,
  ToolStatus,
} from './vocabulary'

/** Bumped when the event shapes change incompatibly. Batches stamped with any
 *  other version are dropped rather than guessed at. */
export const PROTOCOL_VERSION = 1

/** Channel names live here, not in main: the preload must be able to name them
 *  without importing the backend it would otherwise bundle. */
export const SESSION_COMMAND_CHANNEL = 'session:command'
export const SESSION_EVENTS_CHANNEL = 'session:events'
/** Pty output, one channel per workspace. Kept off the session event queue so a
 *  build printing thousands of lines cannot delay a thread's tokens. */
export const ptyChannel = (workspaceId: string): string => `pty:${workspaceId}`
/** Repository state, pushed whenever it changes. One message per workspace. */
export const GIT_STATUS_CHANNEL = 'git:status'

export * from './git-protocol'
import type { GitStatus } from './git-protocol'

export type UiEvent =
  | { kind: 'thread-state'; state: ThreadRunState; reason?: string }
  /** Discard the thread built so far; its history is about to be sent again.
   *  Emitted after a checkpoint restore, where the conversation genuinely
   *  changed shape and appending would duplicate it. */
  | { kind: 'thread-reset' }
  | { kind: 'user-message'; id: string; text: string }
  | { kind: 'agent-message-start'; id: string }
  | { kind: 'agent-message-delta'; id: string; text: string }
  | { kind: 'agent-message-end'; id: string }
  | { kind: 'tool-start'; id: string; tool: ToolKind; target: string; parentId?: string }
  /** A summary for a row that has not finished — "run 4/10…", "214 files…".
   *  Additive in protocol 1: a backend that never sends it costs nothing, and
   *  a reader that predates it shows a `raw` row rather than breaking. */
  | { kind: 'tool-progress'; id: string; meta: string }
  | { kind: 'tool-body'; id: string; body: ToolBody }
  | { kind: 'tool-end'; id: string; status: ToolStatus; meta?: string }
  | { kind: 'ask'; id: string; questions: AskQuestion[] }
  /** The end of an ask, however it ended. `answers` is empty unless the
   *  outcome is `answered`; `said` carries the message that replaced the
   *  question when the outcome is `cancelled`, and `reason` says what ended it
   *  when the outcome is `ended`. */
  | {
      kind: 'ask-answered'
      id: string
      outcome: AskOutcome
      answers: AskAnswer[]
      said?: string
      reason?: string
    }
  | { kind: 'approve'; id: string; command: string; note?: string }
  | { kind: 'approve-resolved'; id: string; outcome: ApprovalOutcome }
  | { kind: 'checkpoint'; id: string; label: string }
  | { kind: 'compaction-start'; id: string }
  | {
      kind: 'compaction-done'
      id: string
      beforePercent: number
      afterPercent: number
      summary: string
    }
  /** A compaction that started and then did not happen — pi refuses to compact
   *  a session it considers too small. It must be named rather than left as a
   *  `raw` note: without the id, nothing can end the compaction it began, and
   *  the UI would shimmer forever over work that already stopped. */
  | { kind: 'compaction-skipped'; id: string; reason: string }
  | { kind: 'steer-queued'; id: string; text: string }
  | { kind: 'steer-delivered'; id: string }
  | { kind: 'steer-cancelled'; id: string }
  | { kind: 'usage'; contextPercent: number; tokens: number; costUsd: number }
  /** Which model this thread is on, and how hard it is set to think. Emitted
   *  when a thread opens and whenever either changes, so the chrome never has
   *  to guess and a relaunch shows what pi actually restored. */
  | { kind: 'model'; provider: string; id: string; name: string; reasoning: ReasoningLevel }
  | { kind: 'connectivity'; state: 'degraded' | 'restored'; retryInSeconds?: number }
  /** Anything the adapter could not name. Rendered visibly — never dropped,
   *  because a silently swallowed event is a lie about what the agent did. */
  | { kind: 'raw'; rawKind: string; detail?: string }

export type UiEventKind = UiEvent['kind']

/** One thread's events, in order, as they crossed the boundary together. */
export interface EventBatch {
  v: number
  threadId: string
  /** Sequence number of the first event; a gap means events were lost. */
  from: number
  events: UiEvent[]
}

/** A pinned folder, as the UI needs to draw it. */

export interface WorkspaceSummary {
  id: string
  path: string
  name: string
  note: string
  hue: number
}

/** A model pi has configured, as the selector needs to draw it. */
export interface ModelSummary {
  id: string
  provider: string
  name: string
  contextWindow: number
  /** US dollars per million input tokens — the `$`/`$$`/`$$$` tier. */
  costPerMTok: number
  /** The reasoning levels this model supports. Empty means it cannot reason. */
  reasoning: ReasoningLevel[]
}

/** A thread a search matched, and where the match was. */
export interface SearchHit {
  workspaceId: string
  workspaceName: string
  threadId: string
  title: string
  /** The line the match sits in, for the result row. */
  snippet: string
  modified: string
}

/** A thread that exists on disk, whether this app or the pi CLI started it. */
/** One file a thread changed, with the whole of its change. */
export interface ChangedFile {
  /** Relative to the workspace, which is what a reader recognises. */
  path: string
  added: number
  removed: number
  /** Absent before the thread touched it: this file is new. */
  existed: boolean
  lines: DiffLine[]
}

export interface ThreadSummary {
  id: string
  title: string
  /** ISO timestamp of the last write, for the column's right-hand label. */
  modified: string
  messageCount: number
  /** The branch of this thread's worktree, or null when it runs in the
   *  workspace's own folder. Carried in the listing so a thread reopened after
   *  a restart is still known to be isolated. */
  branch?: string | null
}

/** Commands the UI can issue, with their parameter and result shapes. */
export interface SessionCommands {
  listWorkspaces: { params: Record<string, never>; result: { workspaces: WorkspaceSummary[] } }
  pinWorkspace: { params: { path: string }; result: { workspace: WorkspaceSummary } }
  unpinWorkspace: { params: { workspaceId: string }; result: { ok: true } }
  listThreads: { params: { workspaceId: string }; result: { threads: ThreadSummary[] } }
  /** `worktree` runs the thread in its own checkout on a new branch, made
   *  before the session starts — pi is given a working directory once, so this
   *  cannot be decided later. A failure rejects, leaving no thread behind. */
  createThread: {
    params: { workspaceId: string; title?: string; worktree?: { branch: string } }
    result: { threadId: string }
  }
  openThread: { params: { threadId: string }; result: { ok: true } }
  /** Hides a thread from its workspace's strip. The session file is untouched. */
  archiveThread: { params: { threadId: string }; result: { ok: true } }
  /** Brings a closed thread back — what jumping to it from search does. */
  unarchiveThread: { params: { threadId: string }; result: { ok: true } }
  prompt: {
    params: { threadId: string; text: string; attachments?: AttachmentRef[] }
    result: { ok: true }
  }
  steer: { params: { threadId: string; text: string }; result: { steerId: string } }
  cancelQueuedSteer: { params: { threadId: string; steerId: string }; result: { ok: true } }
  /** Every answer at once. Never one question at a time: a model handed answer
   *  one while the reader is still on question two is acting on half a
   *  decision. */
  answerAsk: {
    params: { threadId: string; askId: string; answers: AskAnswer[] }
    result: { ok: true }
  }
  resolveApproval: {
    params: { threadId: string; approvalId: string; outcome: ApprovalOutcome }
    result: { ok: true }
  }
  listApprovalRules: { params: { workspaceId: string }; result: { rules: string[] } }
  revokeApprovalRule: { params: { workspaceId: string; rule: string }; result: { ok: true } }
  cancelTurn: { params: { threadId: string }; result: { ok: true } }
  retryTurn: { params: { threadId: string }; result: { ok: true } }
  restoreCheckpoint: {
    params: { threadId: string; checkpointId: string }
    result: { threadId: string }
  }
  compact: { params: { threadId: string }; result: { ok: true } }
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
  listChanges: { params: { threadId: string }; result: { files: ChangedFile[] } }
  /** What removing this thread's worktree would cost, or null when it has none.
   *  `commits` counts commits on its branch and nowhere else. */
  threadWorktree: {
    params: { threadId: string }
    result: { worktree: { branch: string; path: string; dirty: number; commits: number } | null }
  }
  /** Removes a thread's worktree. Refuses one holding commits outright — the
   *  commits are the work — and a dirty one unless `force` says the reader was
   *  asked and answered. */
  removeThreadWorktree: {
    params: { threadId: string; force?: boolean }
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
  threadGit: { params: { threadId: string }; result: { status: GitStatus | null } }
  listModels: { params: Record<string, never>; result: { models: ModelSummary[] } }
  setModel: {
    params: { threadId: string; provider: string; model: string }
    result: { ok: true }
  }
  setReasoning: { params: { threadId: string; reasoning: ReasoningLevel }; result: { ok: true } }
}

export type CommandName = keyof SessionCommands
export type CommandParams<N extends CommandName> = SessionCommands[N]['params']
export type CommandResult<N extends CommandName> = SessionCommands[N]['result']

/** Emits one thread's event. The backend owns batching; drivers just speak. */
export type EmitEvent = (threadId: string, event: UiEvent) => void

/** The only seam. Swapping the stub for pi must change nothing above this line. */
export interface SessionDriver {
  readonly kind: string
  execute<N extends CommandName>(name: N, params: CommandParams<N>): Promise<CommandResult<N>>
  dispose(): Promise<void>
}

const KNOWN_KINDS: ReadonlySet<string> = new Set<UiEventKind>([
  'thread-state',
  'thread-reset',
  'user-message',
  'agent-message-start',
  'agent-message-delta',
  'agent-message-end',
  'tool-start',
  'tool-progress',
  'tool-body',
  'tool-end',
  'ask',
  'ask-answered',
  'approve',
  'approve-resolved',
  'checkpoint',
  'compaction-start',
  'compaction-done',
  'compaction-skipped',
  'steer-queued',
  'steer-delivered',
  'steer-cancelled',
  'usage',
  'model',
  'connectivity',
  'raw',
])

export function isKnownEventKind(kind: string): kind is UiEventKind {
  return KNOWN_KINDS.has(kind)
}

/** Coerces anything into a renderable event. A newer backend emitting a kind
 *  this build has never heard of degrades to a visible `raw` row instead of
 *  crashing the thread. */
export function normalizeEvent(value: unknown): UiEvent {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'raw', rawKind: 'malformed', detail: describe(value) }
  }

  const kind = (value as { kind?: unknown }).kind
  if (typeof kind !== 'string') {
    return { kind: 'raw', rawKind: 'malformed', detail: describe(value) }
  }
  if (!isKnownEventKind(kind)) {
    return { kind: 'raw', rawKind: kind, detail: describe(value) }
  }

  return value as UiEvent
}

function describe(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text.slice(0, 200)
  } catch {
    return String(value)
  }
}
