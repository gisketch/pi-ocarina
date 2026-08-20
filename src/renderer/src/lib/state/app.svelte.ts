import { catalog } from './catalog.svelte'
import { clampThread } from '../strip'
import { threads } from './threads.svelte'
import { threadOf, type Mode, type Thread, type ThreadStatus, type Workspace } from '../types'
import type { ThreadId } from '../../../../shared/thread-id'
import { visualColumns } from '../pane-layout'

/** Stand-ins for "there is nothing here yet". Frozen so a component cannot
 *  write into what is meant to be the absence of a workspace or thread. The
 *  hue is the default accent, so the welcome screen is not off-palette. */
const NO_WORKSPACE: Workspace = Object.freeze({
  id: '',
  name: '',
  note: '',
  hue: 152,
  git: null,
  snippet: '',
  threads: Object.freeze([]) as unknown as Thread[],
})

/** What a thread is called before it has said anything. Shared with the catalog
 *  so the two cannot drift; a header that fell back on a different string would
 *  simply stop falling back. */
export const PLACEHOLDER_TITLE = 'new thread'

/** The first non-empty line, trimmed to what a column header can hold. */
function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0)
  return line ? line.trim().slice(0, 80) : PLACEHOLDER_TITLE
}

const NO_THREAD: Thread = Object.freeze({
  id: '',
  title: '',
  status: 'idle',
  meta: '',
  fresh: true,
})

/** Single source of truth for shell state. Every chrome segment reads from here
 *  so real data becomes a drop-in replacement for the mock catalog. */
class AppState {
  workspaceIndex = $state(0)
  mode = $state<Mode>('OCARINA')

  /** Focused thread per workspace — the design's `f` array. Sparse on purpose:
   *  a workspace not in it has never been visited, and starts at column 0. */
  focus = $state<number[]>([])

  get workspaces(): Workspace[] {
    return catalog.workspaces
  }

  get workspace(): Workspace {
    // Before anything is pinned there is no workspace, and the chrome around
    // the welcome screen still reads this. A placeholder keeps every segment
    // blank instead of every segment throwing.
    return this.workspaces[this.workspaceIndex] ?? NO_WORKSPACE
  }

  /** Pulls the focused position back inside a workspace list that changed under
   *  it — pinning a folder replaces the demo catalog wholesale, and an index
   *  left pointing past the end would leave the rail with nothing highlighted
   *  while the rest of the chrome silently read a different workspace. */
  reconcile(): void {
    if (this.workspaces.length === 0) return

    this.workspaceIndex = Math.min(this.workspaceIndex, this.workspaces.length - 1)
    this.focus = this.workspaces.map((workspace, i) =>
      clampThread(this.focus[i] ?? 0, workspace.threads.length),
    )
  }

  get threadIndex(): number {
    return clampThread(this.focus[this.workspaceIndex] ?? 0, this.workspace.threads.length)
  }

  get thread(): Thread {
    return this.workspace.threads[this.threadIndex] ?? NO_THREAD
  }

  /** The focused column's thread, or null when the column is not one.
   *
   *  Everything that commands the backend asks for this rather than for
   *  `thread.id`. The distinction is not a detail: `␣p` on a placeholder used
   *  to record a permission override under an id nothing runs, and the status
   *  bar then read that override back and displayed it. */
  get threadId(): ThreadId | null {
    return threadOf(this.thread)
  }

  get threadLabel(): string {
    if (this.workspace.threads.length === 0) return '–'
    return `${this.threadIndex + 1}/${this.workspace.threads.length}`
  }

  get accented(): boolean {
    // Every mode that takes the keyboard away from the strip says so. OCARINA
    // is the only one that does not, because it is the one you return to.
    return this.mode !== 'OCARINA'
  }

  /** What a column header should show. The live model wins as soon as the
   *  thread has said anything: the catalog's listing is only ever a guess made
   *  before the thread's events arrived. */
  statusOf(thread: Thread): ThreadStatus {
    const live = threads.get(thread.id)
    return live.blocks.length > 0 ? live.status : thread.status
  }

  /** Per thread, the last blocks array searched and what it yielded. The
   *  header asks per render, and during a stream the blocks array is replaced
   *  per batch — but its identity is exactly what says whether the search is
   *  worth repeating. One entry per thread, so nothing grows with a session. */
  #titles = new Map<string, { blocks: readonly unknown[]; title: string }>()

  /** What a column header should call a thread.
   *
   *  A thread created in this session is listed before it has said anything, so
   *  the catalog only has a placeholder for it. pi names a session from its
   *  first message but the app never re-lists, so the thread's own first
   *  message is what the header uses until a relaunch reads pi's name. */
  titleOf(thread: Thread): string {
    if (thread.title !== PLACEHOLDER_TITLE) return thread.title

    const blocks = threads.get(thread.id).blocks
    const seen = this.#titles.get(thread.id)
    if (seen && seen.blocks === blocks) return seen.title

    const first = blocks.find((block) => block.kind === 'user')
    const title = first ? firstLine(first.text) : thread.title
    this.#titles.set(thread.id, { blocks, title })
    return title
  }

  goWorkspace(index: number): void {
    if (index < 0 || index >= this.workspaces.length) return
    this.workspaceIndex = index
  }

  focusThread(index: number): void {
    const focus = this.focus.slice()
    focus[this.workspaceIndex] = clampThread(index, this.workspace.threads.length)
    this.focus = focus
  }

  moveThread(delta: number): void {
    const columns = visualColumns(this.workspace)
    const from = columns.findIndex((column) => column.id === this.thread.id)
    const target = columns[Math.min(columns.length - 1, Math.max(0, from + delta))]
    if (!target) return
    const index = this.workspace.threads.findIndex((column) => column.id === target.id)
    if (index !== -1) this.focusThread(index)
  }
}

export const app = new AppState()
