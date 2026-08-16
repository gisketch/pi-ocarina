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

/** How a tool call ended.
 *
 *  `plain` is a row that never had a status to report (a note, not an outcome).
 *  There is no `timeout`: pi reports one boolean for every bad outcome, and
 *  nothing this app owns can tell a slow tool from a broken one. A status with
 *  no producer is a promise the ledger cannot keep. */
export type ToolStatus = 'running' | 'ok' | 'fail' | 'cancelled' | 'denied' | 'plain'

export type ThreadRunState =
  | 'idle'
  | 'running'
  | 'waiting-input'
  | 'failed'
  | 'done'
  /** Relaunched while a turn was in flight; needs an explicit continue. */
  | 'interrupted'

export type ApprovalOutcome = 'allow-once' | 'always' | 'deny'

/** How hard the model thinks before answering.
 *
 *  These are pi's own seven levels, not the design's four tiles. The mock had
 *  four; a real model may support `max`, and offering only four would quietly
 *  cap what the user can ask for. The selector renders whichever levels the
 *  chosen model actually supports. */
export type ReasoningLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/** In order, weakest first — the order the tiles are drawn in. */
export const REASONING_ORDER: readonly ReasoningLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

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
  /** `@` is not a line of the file: it marks unchanged text the diff skipped,
   *  so a reader can see that the file continues past what is drawn. */
  sign: '+' | '-' | ' ' | '@'
  text: string
  /** Where the line sits in the file — before the change for a removal, after
   *  it for everything else. Absent on a `@` marker, and on a diff that was
   *  written by hand rather than computed. */
  line?: number
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

/** A file handed to the agent with a prompt.
 *
 *  Only the path travels: main reads the bytes. The renderer never opens a
 *  file, which keeps the one process with filesystem access the one that has
 *  it. */
export interface AttachmentRef {
  name: string
  path: string
  mime?: string
}

/** Whether pi can actually take this file with a prompt.
 *
 *  pi 0.84's `prompt()` accepts text and images. An image travels as bytes; a
 *  file of any other kind can only be referenced by path, for pi to open with
 *  its read tool. Calling that second case an attachment would describe
 *  something the seam cannot do. */
export function isImageAttachment(attachment: AttachmentRef): boolean {
  return (attachment.mime ?? '').startsWith('image/')
}
