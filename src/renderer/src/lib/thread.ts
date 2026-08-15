/** Thread view model.
 *
 *  This is the vocabulary the session-backend reducer will produce; the static
 *  shell renders it from fixtures so the components are already written against
 *  the real contract. Unknown row kinds must stay renderable — see `raw`. */

export type ToolKind =
  | 'read'
  | 'grep'
  | 'write'
  | 'edit'
  | 'bash'
  | 'fetch'
  | 'todo'
  | 'skill'
  | 'agent'
  | 'raw'

export type ToolStatus = 'running' | 'ok' | 'fail' | 'timeout' | 'cancelled' | 'denied' | 'plain'

/** A line of source with an optional trailing comment rendered dimmer. */
export interface CodeLine {
  text: string
  comment?: string
}

export interface MatchLine {
  location: string
  before: string
  match: string
  after: string
}

export interface DiffLine {
  sign: '+' | '-' | ' '
  text: string
}

export interface TerminalLine {
  text: string
  tone?: 'prompt' | 'ok' | 'err' | 'dim'
}

export interface TodoItem {
  done: boolean
  text: string
}

export type ToolBody =
  | { type: 'code'; lines: CodeLine[] }
  | { type: 'matches'; lines: MatchLine[] }
  | { type: 'diff'; lines: DiffLine[] }
  | { type: 'terminal'; lines: TerminalLine[]; tone?: 'normal' | 'error' }
  | { type: 'todo'; items: TodoItem[] }

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

export interface AskOption {
  label: string
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
