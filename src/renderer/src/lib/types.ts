import type { ThreadId } from '../../../shared/thread-id'
import type { GitStatus } from '../../../shared/protocol'
import type { ThreadRunState } from '../../../shared/vocabulary'

/** `TERM` is `INSERT` for the terminal column: the pty owns every key while it
 *  is on, and `esc` is the one key the shell keeps for itself. */
/** READ is the transcript: a ring on one block, and h/j/k/l belonging to the
 *  block rather than to the strip. It exists so that walking a conversation
 *  cannot move a column by accident — `esc` first, then the column keys. */
export type Mode = 'NORMAL' | 'READ' | 'INSERT' | 'LEADER' | 'TERM' | 'DIFF'

/** The column header speaks the same status the reducer produces, so a live
 *  thread and a listed one cannot disagree about what a thread is doing. */
export type ThreadStatus = ThreadRunState

/** A column in a workspace's strip.
 *
 *  The terminal is one of these rather than a surface of its own, so focus,
 *  clamping, the titlebar dots, column moves and leader-x all work on it
 *  without knowing it is a terminal. */
export interface Thread {
  /** The **column's** id, which is a thread's id only sometimes. A fresh
   *  placeholder and a shell are columns with no session behind them, and both
   *  carry an id of their own. Use `threadOf` before sending it anywhere. */
  id: string
  title: string
  /** What the catalog knew at list time; the live model overrides it once the
   *  thread's events arrive. */
  status: ThreadStatus
  /** Right-aligned label in the column header, e.g. "14:02 · done ✓". */
  meta: string
  /** A started-but-empty thread; renders the hero column instead of history. */
  fresh?: boolean
  /** The workspace's shell. Exactly one per workspace, created on demand. */
  terminal?: boolean
  /** The branch of the worktree this thread runs in, or null when it runs in
   *  the workspace's own directory. Carried on the thread rather than derived,
   *  so a column reopened after a restart still says it is isolated. */
  branch?: string | null
}

/** The pi thread this column is, or null when it is not one.
 *
 *  The only place a `ThreadId` is minted in the renderer, and the cast is
 *  sound: a column that is neither fresh nor a shell was built from a
 *  `ThreadSummary`, whose id pi minted. Everything that commands a thread goes
 *  through here, so a column that has no session cannot reach the backend at
 *  all — which is what stops main being asked about `fresh:<workspace>`. */
export function threadOf(column: Thread): ThreadId | null {
  if (column.fresh === true || column.terminal === true || column.id === '') return null
  return column.id as ThreadId
}

/** The id a workspace's terminal column always has. Derived rather than stored,
 *  so main and the renderer cannot disagree about which pty is which. */
export function terminalId(workspaceId: string): string {
  return `terminal:${workspaceId}`
}

/** The workspace a terminal column belongs to, or null if it is not one.
 *
 *  Read from the id rather than from what happens to be focused: closing a
 *  shell asks the backend a question first, and focus can move while it
 *  answers. */
export function workspaceOfTerminal(columnId: string): string | null {
  return columnId.startsWith('terminal:') ? columnId.slice('terminal:'.length) : null
}

export interface Workspace {
  id: string
  name: string
  /** Ocarina note shown as "♪ D" in chrome. */
  note: string
  /** oklch hue seeding every accent in this workspace. */
  hue: number
  /** Repository state, or null when the folder is not a repo — and while the
   *  first read is still out. Both mean the same to the chrome: no git
   *  segments, rather than a branch nobody has confirmed. */
  git: GitStatus | null
  snippet: string
  threads: Thread[]
}
