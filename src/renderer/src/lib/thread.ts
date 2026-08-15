/** Thread view model.
 *
 *  The vocabulary itself is shared with the session backend (one definition, in
 *  `src/shared/vocabulary.ts`) and re-exported here so components keep a single
 *  import. What this file adds is the shape of a *rendered* thread: rows,
 *  blocks, and the inline splitter. Unknown row kinds must stay renderable —
 *  see `raw`. */

export type {
  AskOption,
  CodeLine,
  DiffLine,
  MatchLine,
  TerminalLine,
  TodoItem,
  ToolBody,
  ToolKind,
  ToolStatus,
} from '../../../shared/vocabulary'

import type { AskOption, ToolBody, ToolKind, ToolStatus } from '../../../shared/vocabulary'

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
  | { kind: 'ask'; id: string; question: string; options: AskOption[] }
  | { kind: 'approve'; id: string; command: string; note?: string }

export interface InlineSegment {
  text: string
  code: boolean
}

/** Splits `text` on backticks into plain and inline-code segments.
 *  Deliberately minimal: full markdown arrives with the real reducer. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let rest = text
  let code = false

  while (rest.length > 0) {
    const tick = rest.indexOf('`')
    if (tick === -1) {
      segments.push({ text: rest, code })
      break
    }
    if (tick > 0) segments.push({ text: rest.slice(0, tick), code })
    rest = rest.slice(tick + 1)
    code = !code
  }

  return segments.filter((segment) => segment.text.length > 0)
}
