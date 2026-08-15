import { catalog } from './catalog.svelte'
import { clampThread } from '../strip'
import { threads } from './threads.svelte'
import type { Mode, Thread, ThreadStatus, Workspace } from '../types'

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
    return this.workspaces[this.workspaceIndex]
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
    return this.workspace.threads[this.threadIndex]
  }

  get threadLabel(): string {
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
