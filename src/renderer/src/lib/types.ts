export type Mode = 'NORMAL' | 'INSERT' | 'LEADER'

export type ThreadStatus = 'running' | 'done' | 'idle' | 'failed'

export interface Thread {
  id: string
  title: string
  status: ThreadStatus
  /** Right-aligned label in the column header, e.g. "14:02 · done ✓". */
  meta: string
  /** A started-but-empty thread; renders the hero column instead of history. */
  fresh?: boolean
}

export interface Workspace {
  id: string
  name: string
  /** Ocarina note shown as "♪ D" in chrome. */
  note: string
  /** oklch hue seeding every accent in this workspace. */
  hue: number
  branch: string
  /** Compact git summary, e.g. "↑1 +1~1"; empty when clean/untracked. */
  git: string
  snippet: string
  threads: Thread[]
}
