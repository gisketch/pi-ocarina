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
  | 'lsp'
  /** What the model thought before it answered. A tool kind because it is one
   *  more thing the agent did on the way to an answer, and because a row is
   *  the only shape that puts it on the same spine as the calls around it. */
  | 'think'
  | 'fetch'
  | 'todo'
  | 'skill'
  /** A command the reader's configuration file runs at a point in a turn's
   *  life. A tool kind because a hook is one more thing that happened during
   *  the turn, and a row is the shape the app already has for saying so. */
  | 'hook'
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
  // A fetched page. Markdown rather than lines because the structure — which
  // line was a heading, which run was code — is most of why a page was worth
  // fetching, and flattening it to text throws that away.
  | { type: 'markdown'; text: string }
  // A picture, as a data URI. Every image in the transcript — attached, pasted,
  // read by the agent, or written into an answer as markdown — draws through
  // one component, so four of them cannot end up looking like four ideas.
  /** `caption` is what the picture is, said beside it — `1078×822`. Optional:
   *  a format whose header this app cannot read still draws, it just says
   *  nothing about its size rather than guessing. */
  | { type: 'image'; src: string; alt: string; caption?: string }
  /** A thought, rendered as markdown but quieter and smaller than an answer.
   *  Its own type rather than `markdown`, which draws at full strength: a
   *  thought styled like an answer competes with the answer. */
  | { type: 'thought'; text: string }

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

/** An attachment as a *sent message* carries it.
 *
 *  Not an `AttachmentRef`: a replayed session knows the names its prompt
 *  recorded but not the paths, because a pasted screenshot lives in a
 *  temporary directory that may be gone by the time the thread is reopened.
 *  The name is what draws the chip, and is the part that always survives. */
export interface MessageAttachment {
  name: string
  /** Present when the file is still where the message left it — which is what
   *  makes the chip expandable and openable. */
  path?: string
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

/** A role a child agent can be spawned as.
 *
 *  A role is only an added system prompt with a ceiling around it: the tools it
 *  may hold and the model it runs on. The orchestrator names one, and may
 *  narrow the tools or change the model, but never writes a saved role's
 *  instructions. */
export interface AgentRole {
  id: string
  name: string
  /** Appended to the child's system prompt. The whole of what a role is. */
  instructions: string
  /** The ceiling. A spawn may remove from this list and may not add to it. */
  tools: string[]
  /** Used when the spawn does not name one. Absent means the parent's model. */
  model?: string
}

/** The tools an inline role may hold.
 *
 *  An inline role is a system prompt the model wrote in the moment: the
 *  least-vetted thing in the system, so it gets the least. Writing needs a
 *  saved role. */
export const READ_ONLY_TOOLS: readonly string[] = ['read', 'grep', 'find', 'ls']

/** How a child ended, as the parent model reads it.
 *
 *  Distinct from `ToolStatus` on purpose: a child that was denied at the
 *  approval gate and one that the reader stopped are different facts, and the
 *  parent must be able to branch on which. */
export type AgentStatus = 'running' | 'ok' | 'fail' | 'denied' | 'cancelled'

/** One child, as both the row and the envelope entry.
 *
 *  The same shape serves the display and the model because they must not
 *  disagree about what a child was — the row saying `scout` while the entry
 *  says something else is the failure this avoids. */
export interface AgentEntry {
  /** The child's own tool-call id, and the `parentId` its rows carry. */
  id: string
  /** Drawn from the pool, unique among children alive at the same moment. */
  name: string
  /** The role's name, or `inline` when the orchestrator wrote the prompt. */
  role: string
  /** The short line the row shows. Written by the orchestrator. */
  label: string
  status: AgentStatus
  /** Set while the child is waiting for a slot under the running cap. It has a
   *  row from the moment it is asked for — four rows and four missing ones
   *  would read as a fan-out that lost half of itself. */
  queued?: true
  /** The child's final message. Absent while running, and absent for a
   *  cancelled child — a half-finished report read as a finished one is the
   *  failure mode. */
  output?: string
  /** Set when the per-child cap cut the output, so the parent knows it holds a
   *  fragment. */
  truncated?: true
  usage: AgentUsage
  startedAt: number
  endedAt?: number
}

/** What a child cost. Rolled into the thread's own figures, and shown per
 *  child in the peek. */
export interface AgentUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

/** A child's tokens, counted the way pi counts a session's.
 *
 *  All four buckets, not just input and output: pi's own `tokens.total` is the
 *  sum of all of them, and the thread's figure adds the two together. Counting
 *  them differently made a read-heavy fan-out — where cached reads dominate —
 *  report a fraction of what it spent. One function so the status bar and the
 *  peek cannot drift apart. */
export function tokensIn(usage: AgentUsage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite
}

/** One child, as the orchestrator asks for it. */
export interface SpawnRequest {
  /** A saved role's name. Omitted when `instructions` are given inline. */
  role?: string
  /** An inline system prompt, used when no saved role fits. Takes the
   *  read-only ceiling. */
  instructions?: string
  /** The child's brief: everything it needs, since it sees nothing else. */
  task: string
  /** The row's line — short, imperative, what this child is for. */
  label: string
  /** Overrides the role's model. */
  model?: string
  /** Narrows the role's tools. Anything not already in the role's list is
   *  dropped rather than granted. */
  tools?: string[]
}
