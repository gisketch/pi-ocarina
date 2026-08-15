/** Shared vocabulary: the words main and renderer both speak.
 *
 *  These types are the durable contract. `src/renderer/src/lib/thread.ts`
 *  re-exports them so components keep one definition, and the pi adapter maps
 *  into them so no pi type ever crosses the process boundary. */

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

/** `plain` is a row that never had a status to report (a note, not an outcome). */
export type ToolStatus = 'running' | 'ok' | 'fail' | 'timeout' | 'cancelled' | 'denied' | 'plain'

export type ThreadRunState =
  | 'idle'
  | 'running'
  | 'waiting-input'
  | 'failed'
  | 'done'
  /** Relaunched while a turn was in flight; needs an explicit continue. */
  | 'interrupted'

export type ApprovalOutcome = 'allow-once' | 'always' | 'deny'

export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high'

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

export interface AskOption {
  label: string
}

/** A file handed to the agent with a prompt. Bytes travel to main; the renderer
 *  reads a file only to draw a preview. */
export interface AttachmentRef {
  name: string
  path?: string
  mime?: string
}
