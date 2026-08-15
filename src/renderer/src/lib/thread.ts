/** Thread view model.
 *
 *  The vocabulary itself is shared with the session backend (one definition, in
 *  `src/shared/vocabulary.ts`) and re-exported here so components keep a single
 *  import. What this file adds is the shape of a *rendered* thread: rows,
 *  blocks, and the inline splitter. Unknown row kinds must stay renderable —
 *  see `raw`. */

export type {
  ApprovalOutcome,
  AskOption,
  CodeLine,
  DiffLine,
  MatchLine,
  TerminalLine,
  ThreadRunState,
  TodoItem,
  ToolBody,
  ToolKind,
  ToolStatus,
} from '../../../shared/vocabulary'

import type {
  ApprovalOutcome,
  AskOption,
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
  status: ToolStatus
  /** Right-aligned summary, e.g. "142L", "3 matches", "exit 0 · 3.2s". */
  meta?: string
  /** Present when the row can expand; absent rows are not clickable. */
  body?: ToolBody
  /** Initial expansion state, mirroring the reference's default toggles. */
  open?: boolean
  /** Nested subagent rows, one level deep. */
  children?: ToolRow[]
}

export type Block =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string; streaming?: boolean }
  | { kind: 'ledger'; id: string; rows: ToolRow[] }
  | { kind: 'ask'; id: string; question: string; options: AskOption[]; answeredIndex?: number }
  | { kind: 'approve'; id: string; command: string; note?: string; outcome?: ApprovalOutcome }
  | { kind: 'checkpoint'; id: string; label: string }
  | {
      kind: 'compaction'
      id: string
      running: boolean
      beforePercent?: number
      afterPercent?: number
      summary?: string
      /** Set when the compaction started and then did not happen. The card says
       *  so instead of claiming a compaction that never took place. */
      skipped?: string
    }
  /** Text waiting to be handed to a running turn. Removed once delivered. */
  | { kind: 'steer'; id: string; text: string }
  /** An event this build could not name, shown rather than swallowed. */
  | { kind: 'raw'; id: string; rawKind: string; detail?: string }

/** What one thread looks like right now. The reducer's only output. */
export interface ThreadViewModel {
  blocks: Block[]
  /** What the header shows: `runState`, unless a card is waiting on a person. */
  status: ThreadRunState
  /** What the backend last reported, before pending gates were considered.
   *  Kept apart from `status` so answering an ask restores the real state
   *  instead of leaving the thread stuck at `waiting-input`. */
  runState: ThreadRunState
  /** Why the thread failed, when it did. */
  reason?: string
  usage?: { contextPercent: number; tokens: number; costUsd: number }
  connectivity?: { state: 'degraded' | 'restored'; retryInSeconds?: number }
}

export const EMPTY_THREAD: ThreadViewModel = { blocks: [], status: 'idle', runState: 'idle' }

/** How many blocks a finished compaction stands in front of.
 *
 *  A compaction summary replaces the history above it, so that history
 *  collapses behind the card — matching the reference's "done (collapsed
 *  history)" state. Zero means there is nothing to collapse: no compaction has
 *  finished, one finished with no history above it, or the one that finished
 *  was refused and so replaced nothing. */
export function collapsedBefore(blocks: Block[]): number {
  const cut = blocks.findLastIndex(
    (block) => block.kind === 'compaction' && !block.running && !block.skipped,
  )
  return cut > 0 ? cut : 0
}

export type { InlineSegment, MarkdownNode } from './markdown'
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
