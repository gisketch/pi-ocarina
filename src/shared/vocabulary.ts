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

/** One thing the reader can pick.
 *
 *  `id` is what the model branches on and `title` is what the reader reads —
 *  both travel back, so a model never has to remember what an id meant, and a
 *  reworded option never silently changes what the model does. `description` is
 *  the lighter subtext under the title, which is what lets a real choice be
 *  readable without a paragraph in the question. */
export interface AskChoice {
  id: string
  title: string
  description?: string
}

/** One question in an ask.
 *
 *  `kind` rather than three question types: a new kind is a new value and a
 *  renderer for it, not a new tool and not a new seam. */
export interface AskQuestion {
  id: string
  kind: 'one' | 'many' | 'text'
  /** The question itself. */
  prompt: string
  /** Lighter text under the prompt, for what a question cannot say in a line. */
  description?: string
  /** Choices, for `one` and `many`. Empty for `text`. */
  choices?: AskChoice[]
  /** Whether a choice question also offers "something else", typed into the
   *  card. Never into the composer: prose in the composer means something else
   *  entirely. */
  allowOther?: boolean
  /** Whether the reader may pass over it. A required question is the normal
   *  case: the agent asked because it needs the answer. */
  optional?: boolean
}

/** What the reader said to one question.
 *
 *  `skipped` is written rather than the entry being absent: a missing key reads
 *  as a bug, and "no preference" is not "never asked". */
export interface AskAnswer {
  id: string
  kind: AskQuestion['kind']
  /** Choice ids picked. `['other']` when the reader typed instead. */
  chosen: string[]
  /** Their titles, in the same order. */
  labels: string[]
  /** Free text, for a `text` question or an off-menu answer. */
  text?: string
  skipped?: boolean
}

/** How an ask ended.
 *
 *  Held apart from the answers because three of the four ways out carry none,
 *  and a card showing an empty answer list would read as "they said nothing"
 *  rather than "nobody was asked to finish". */
export type AskOutcome =
  /** Every question answered or skipped in the card. */
  | 'answered'
  /** Prose in the composer, which means none of the above. */
  | 'cancelled'
  /** The turn ended under it: cancelled, closed, or the app quit. */
  | 'ended'

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
