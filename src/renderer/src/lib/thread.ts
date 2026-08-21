/** Thread view model.
 *
 *  The vocabulary itself is shared with the session backend (one definition, in
 *  `src/shared/vocabulary.ts`) and re-exported here so components keep a single
 *  import. What this file adds is the shape of a *rendered* thread: rows,
 *  blocks, and the inline splitter. Unknown row kinds must stay renderable —
 *  see `raw`. */

export type {
  AgentEntry,
  AgentRole,
  AgentStatus,
  AgentUsage,
  ApprovalOutcome,
  AskAnswer,
  AskOutcome,
  AskQuestion,
  ReasoningLevel,
  CodeLine,
  DiffLine,
  MatchLine,
  MessageAttachment,
  TerminalLine,
  ThreadRunState,
  TodoItem,
  ToolBody,
  ToolKind,
  ToolStatus,
} from '../../../shared/vocabulary'

import type {
  AgentEntry,
  ApprovalOutcome,
  AskAnswer,
  AskOutcome,
  AskQuestion,
  MessageAttachment,
  ReasoningLevel,
  ThreadRunState,
  ToolBody,
  ToolKind,
  ToolStatus,
} from '../../../shared/vocabulary'
import { lastCodeBlock } from './markdown'

export interface ToolRow {
  id: string
  kind: ToolKind
  /** Primary label — path, command, url, query. */
  target: string
  /** A muted word drawn after the target: what kind of call this is within
   *  its family. An lsp row's `references`; nothing on most rows. */
  detail?: string
  /** The language of the file this call acted on. Colours a `read` body and
   *  names a language server's icon. */
  lang?: string
  status: ToolStatus
  /** Right-aligned summary, e.g. "142L", "3 matches", "exit 0 · 3.2s". */
  meta?: string
  /** Present when the row can expand; absent rows are not clickable. */
  body?: ToolBody
  /** Initial expansion state, mirroring the reference's default toggles. */
  open?: boolean
  /** Nested subagent rows. Two levels are reachable: a child agent may spawn
   *  its own, and a grandchild may not spawn at all. */
  children?: ToolRow[]
  /** Present only on an `agent` row: who the child is, and how it is going.
   *  The row and the envelope the model reads are the same shape, so the two
   *  cannot disagree about what a child was. */
  agent?: AgentEntry
}

export type Block =
  | { kind: 'user'; id: string; text: string; attachments?: MessageAttachment[] }
  | { kind: 'agent'; id: string; text: string; streaming?: boolean }
  | { kind: 'ledger'; id: string; rows: ToolRow[] }
  /** A question, or several, and what became of them. `outcome` is undefined
   *  while it is pending, which is what makes it a gate. */
  | {
      kind: 'ask'
      id: string
      questions: AskQuestion[]
      outcome?: AskOutcome
      answers?: AskAnswer[]
      said?: string
      reason?: string
    }
  | {
      kind: 'approve'
      id: string
      command: string
      note?: string
      /** Who is asking, when a child agent is. */
      agent?: { name: string; role: string }
      outcome?: ApprovalOutcome
    }
  | { kind: 'checkpoint'; id: string; label: string }
  | {
      kind: 'compaction'
      id: string
      running: boolean
      beforePercent?: number
      afterPercent?: number
      summary?: string
      /** Raw tokens the compaction reclaimed, when pi reported both counts. */
      tokensSaved?: number
      /** Set when the compaction started and then did not happen. The card says
       *  so instead of claiming a compaction that never took place. */
      skipped?: string
    }
  /** Text waiting to be handed to a running turn. Removed once delivered. */
  | { kind: 'steer'; id: string; text: string }
  /** An event this build could not name, shown rather than swallowed. */
  | { kind: 'raw'; id: string; rawKind: string; detail?: string }

/** What one thread looks like right now. The reducer's only output. */
/** One turn, as long as it took.
 *
 *  `endedAt` absent means it is still running and the footer counts. `outcome`
 *  is how it stopped, because a turn that failed and a turn that finished took
 *  the same time and mean opposite things. */
export interface TurnSpan {
  startedAt: number
  endedAt?: number
  outcome?: 'done' | 'failed' | 'stopped'
}

export interface ThreadViewModel {
  blocks: Block[]
  /** What the header shows: `runState`, unless a card is waiting on a person. */
  status: ThreadRunState
  /** What the backend last reported, before pending gates were considered.
   *  Kept apart from `status` so answering an ask restores the real state
   *  instead of leaving the thread stuck at `waiting-input`. */
  runState: ThreadRunState
  /** The oldest question still waiting on the reader, or null.
   *
   *  Carried rather than looked up: the header, the rail and the key routing
   *  all ask, several times per paint and once per thread of every workspace,
   *  and the reducer is already walking these blocks. */
  pendingAskId?: string | null
  /** Why the thread failed, when it did. */
  reason?: string
  usage?: { contextPercent: number; tokens: number; costUsd: number }
  /** What pi says this thread is running on. Absent until the thread opens. */
  model?: { provider: string; id: string; name: string; reasoning: ReasoningLevel }
  connectivity?: { state: 'degraded' | 'restored'; retryInSeconds?: number }
  /** Finished turns' clocks, keyed by the user block that opened each turn.
   *
   *  Only turns run in this session appear: replay records what was said,
   *  not how long it took, and a collapsed row for a replayed turn says
   *  `worked` with no duration. Stamped at turn end, never while running —
   *  the running turn's clock is `turn` below. */
  spans?: Record<string, TurnSpan>
  /** The turn the thread is running, or the one it last ran.
   *
   *  Timed here rather than by the backend: it is what the reader waited, not
   *  what pi billed, and nothing about it belongs in the session log. Absent
   *  until a turn actually starts in this session, which is what keeps a
   *  reopened thread from drawing a footer for work it only read about. */
  turn?: TurnSpan
}

export const EMPTY_THREAD: ThreadViewModel = {
  blocks: [],
  status: 'idle',
  runState: 'idle',
  pendingAskId: null,
}

export type { InlineSegment, ListItem, MarkdownNode } from './markdown'
export { lastCodeBlock, parseInline, parseMarkdown } from './markdown'

/** The newest fenced code block anywhere in a thread — what `y` copies.
 *  Searched newest-first, because that is what "the last block" means to
 *  someone who just watched it stream in. */
export function newestCodeBlock(blocks: Block[]): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.kind !== 'agent' && block.kind !== 'user') continue

    const code = lastCodeBlock(block.text)
    if (code !== null) return code
  }
  return null
}
