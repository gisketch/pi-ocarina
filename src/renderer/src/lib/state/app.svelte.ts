import { WORKSPACES } from '../mock/workspaces'
import type { Mode, Thread, Workspace } from '../types'

/** Single source of truth for shell state. Every chrome segment reads from here
 *  so real data becomes a drop-in replacement for the mock catalog. */
class AppState {
  readonly workspaces: Workspace[] = WORKSPACES

  workspaceIndex = $state(0)
  mode = $state<Mode>('NORMAL')

  /** Focused thread per workspace — the design's `f` array. */
  focus = $state<number[]>(WORKSPACES.map(() => 0))

  get workspace(): Workspace {
    return this.workspaces[this.workspaceIndex]
  }

  get threadIndex(): number {
    return this.focus[this.workspaceIndex]
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

  goWorkspace(index: number): void {
    if (index < 0 || index >= this.workspaces.length) return
    this.workspaceIndex = index
  }

  focusThread(index: number): void {
    const max = this.workspace.threads.length - 1
    const next = Math.min(max, Math.max(0, index))
    const focus = this.focus.slice()
    focus[this.workspaceIndex] = next
    this.focus = focus
  }

  moveThread(delta: number): void {
    this.focusThread(this.threadIndex + delta)
  }
}

export const app = new AppState()
