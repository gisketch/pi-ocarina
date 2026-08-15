import { catalog } from './catalog.svelte'
import { clampThread } from '../strip'
import { threads } from './threads.svelte'
import type { Mode, Thread, ThreadStatus, Workspace } from '../types'

/** Stand-ins for "there is nothing here yet". Frozen so a component cannot
 *  write into what is meant to be the absence of a workspace or thread. The
 *  hue is the default accent, so the welcome screen is not off-palette. */
const NO_WORKSPACE: Workspace = Object.freeze({
  id: '',
  name: '',
  note: '',
  hue: 152,
  branch: '',
  git: '',
  snippet: '',
  threads: Object.freeze([]) as unknown as Thread[],
})

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
  mode = $state<Mode>('NORMAL')

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

  get threadLabel(): string {
    if (this.workspace.threads.length === 0) return '–'
    return `${this.threadIndex + 1}/${this.workspace.threads.length}`
  }

  get accented(): boolean {
    return this.mode === 'INSERT' || this.mode === 'LEADER'
  }

  /** What a column header should show. The live model wins as soon as the
   *  thread has said anything: the catalog's listing is only ever a guess made
   *  before the thread's events arrived. */
  statusOf(thread: Thread): ThreadStatus {
    const live = threads.get(thread.id)
    return live.blocks.length > 0 ? live.status : thread.status
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
    this.focusThread(this.threadIndex + delta)
  }
}

export const app = new AppState()
