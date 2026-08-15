import type { ThreadRunState } from '../../../shared/vocabulary'

export type Mode = 'NORMAL' | 'INSERT' | 'LEADER'

/** The column header speaks the same status the reducer produces, so a live
 *  thread and a listed one cannot disagree about what a thread is doing. */
export type ThreadStatus = ThreadRunState

export interface Thread {
  id: string
  title: string
  /** What the catalog knew at list time; the live model overrides it once the
   *  thread's events arrive. */
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
