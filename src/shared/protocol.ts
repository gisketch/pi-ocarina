/** The seam between the session backend and the UI.
 *
 *  Everything here is message-shaped and serialisable: no shared memory, no
 *  callbacks across the boundary. That is what lets a session move to a
 *  utilityProcess later without the renderer noticing. */

import type {
  ApprovalOutcome,
  AskOption,
  AttachmentRef,
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

/** What the backend says happened. The reducer turns these into blocks. */
export type UiEvent =
  | { kind: 'thread-state'; state: ThreadRunState; reason?: string }
  | { kind: 'user-message'; id: string; text: string }
  | { kind: 'agent-message-start'; id: string }
  | { kind: 'agent-message-delta'; id: string; text: string }
  | { kind: 'agent-message-end'; id: string }
  | { kind: 'tool-start'; id: string; tool: ToolKind; target: string; parentId?: string }
  | { kind: 'tool-body'; id: string; body: ToolBody }
  | { kind: 'tool-end'; id: string; status: ToolStatus; meta?: string }
  | { kind: 'ask'; id: string; question: string; options: AskOption[] }
  | { kind: 'ask-answered'; id: string; optionIndex: number }
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
  | { kind: 'steer-queued'; id: string; text: string }
  | { kind: 'steer-delivered'; id: string }
  | { kind: 'steer-cancelled'; id: string }
  | { kind: 'usage'; contextPercent: number; tokens: number; costUsd: number }
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

/** Commands the UI can issue, with their parameter and result shapes. */
export interface SessionCommands {
  createThread: { params: { workspaceId: string; title?: string }; result: { threadId: string } }
  openThread: { params: { threadId: string }; result: { ok: true } }
  archiveThread: { params: { threadId: string }; result: { ok: true } }
  prompt: {
    params: { threadId: string; text: string; attachments?: AttachmentRef[] }
    result: { ok: true }
  }
  steer: { params: { threadId: string; text: string }; result: { steerId: string } }
  cancelQueuedSteer: { params: { threadId: string; steerId: string }; result: { ok: true } }
  answerAsk: { params: { threadId: string; askId: string; optionIndex: number }; result: { ok: true } }
  resolveApproval: {
    params: { threadId: string; approvalId: string; outcome: ApprovalOutcome }
    result: { ok: true }
  }
  cancelTurn: { params: { threadId: string }; result: { ok: true } }
  retryTurn: { params: { threadId: string }; result: { ok: true } }
  restoreCheckpoint: {
    params: { threadId: string; checkpointId: string }
    result: { threadId: string }
  }
  compact: { params: { threadId: string }; result: { ok: true } }
  setModel: { params: { threadId: string; model: string }; result: { ok: true } }
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
  'user-message',
  'agent-message-start',
  'agent-message-delta',
  'agent-message-end',
  'tool-start',
  'tool-body',
  'tool-end',
  'ask',
  'ask-answered',
  'approve',
  'approve-resolved',
  'checkpoint',
  'compaction-start',
  'compaction-done',
  'steer-queued',
  'steer-delivered',
  'steer-cancelled',
  'usage',
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
