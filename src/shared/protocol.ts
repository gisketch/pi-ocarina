/** The seam between the session backend and the UI.
 *
 *  Everything here is message-shaped and serialisable: no shared memory, no
 *  callbacks across the boundary. That is what lets a session move to a
 *  utilityProcess later without the renderer noticing. */

import type {
  AgentEntry,
  ApprovalOutcome,
  AskAnswer,
  AskOutcome,
  AskQuestion,
  AttachmentRef,
  DiffLine,
  MessageAttachment,
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
  /** `text` is what the reader typed. Files they attached travel beside it,
   *  never appended to it: a description in the prose is the separate row the
   *  chips replace. Additive — a backend that sends none draws as before. */
  | {
      kind: 'user-message'
      id: string
      text: string
      attachments?: MessageAttachment[]
    }
  /** The model started thinking. pi streams reasoning as deltas inside
   *  `message_update`, so a thread can show a live tail rather than waiting
   *  for the whole thought. Additive: a model that never thinks sends none of
   *  these and the transcript is what it always was. */
  | { kind: 'reasoning-start'; id: string }
  | { kind: 'reasoning-delta'; id: string; text: string }
  /** `ms` is how long the thinking took, wall-clock between the first delta
   *  and this. */
  | { kind: 'reasoning-end'; id: string; ms: number }
  | { kind: 'agent-message-start'; id: string }
  | { kind: 'agent-message-delta'; id: string; text: string }
  | { kind: 'agent-message-end'; id: string }
  | {
      kind: 'tool-start'
      id: string
      tool: ToolKind
      target: string
      /** A muted word after the target, saying what kind of call this is
       *  within its family — an lsp row's `references`, `outline`. Additive:
       *  a backend that never sends it draws the row exactly as before. */
      detail?: string
      parentId?: string
      /** Present only on an `agent` row: who the child is. The row and the
       *  envelope the model reads carry the same shape, so the two cannot
       *  disagree about what a child was. */
      agent?: AgentEntry
    }
  /** A child agent's row changed without ending: it settled, or its usage
   *  moved. Additive — a backend that never sends it costs nothing. */
  | { kind: 'agent-update'; id: string; agent: AgentEntry }
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
  | {
      kind: 'approve'
      id: string
      command: string
      note?: string
      /** Present when a child agent raised it, so the card can say who is
       *  asking — "write auth.ts?" is unanswerable while four children run. */
      agent?: { name: string; role: string }
    }
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

export type {
  CommandName,
  CommandParams,
  CommandResult,
  SessionCommands,
} from './commands'
import type { CommandName, CommandParams, CommandResult } from './commands'

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
  'reasoning-start',
  'reasoning-delta',
  'reasoning-end',
  'agent-message-start',
  'agent-message-delta',
  'agent-message-end',
  'tool-start',
  'agent-update',
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
