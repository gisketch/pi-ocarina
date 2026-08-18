/** The open workspace's permission level, as the screens draw it.
 *
 *  A copy of main's answer, never the decision itself: the gate in main is the
 *  only thing that enforces a level, and a view that could be raced or reloaded
 *  is not a safe place to keep a policy about writing to someone's disk.
 *
 *  The browser harness has no backend, so it holds the level locally — a
 *  settings row that cannot be moved cannot be reviewed against the design. */

import {
  DEFAULT_PERMISSION,
  nextLevel,
  PERMISSION_LABELS,
  type PermissionLevel,
} from '../../../../shared/permissions'
import { confirm } from './confirm.svelte'
import { session } from '../session'

class PermissionState {
  /** What is in force. */
  level = $state<PermissionLevel>(DEFAULT_PERMISSION)
  /** The workspace's own, when it has set one. Absent means it inherits. */
  workspace = $state<PermissionLevel | undefined>(undefined)
  global = $state<PermissionLevel>(DEFAULT_PERMISSION)

  /** This thread's own level, when it set one. Lives for as long as the app is
   *  open, in main; this is a copy for the bar to draw. */
  thread = $state<PermissionLevel | undefined>(undefined)

  #workspaceId = ''
  #threadId = ''

  /** What the workspace row reads: its own level, or what it inherits. */
  get row(): string {
    const label = PERMISSION_LABELS[this.level]
    return this.workspace === undefined ? `inherit — ${label}` : label
  }

  async load(workspaceId: string, threadId = ''): Promise<void> {
    this.#workspaceId = workspaceId
    this.#threadId = threadId
    if (!session.wired) return

    try {
      const described = await session.invoke('workspacePermission', { workspaceId })
      this.workspace = described.workspace
      this.global = described.global
      this.level = described.level

      if (threadId === '') {
        this.thread = undefined
        return
      }
      // The thread's own level, asked for second because it wins: the bar must
      // never show the workspace's answer for a thread that overrode it.
      const own = await session.invoke('threadPermission', { threadId, workspaceId })
      this.thread = own.thread
      this.level = own.level
    } catch {
      // A level we cannot read is not worth a banner: the bar keeps the last
      // one it knew, and main is still enforcing whatever the truth is.
    }
  }

  /** The level the row would move to next, without moving to it. Lets the
   *  confirmation name what it is about to switch on. */
  get pending(): PermissionLevel | undefined {
    return nextLevel(this.workspace)
  }

  async set(level: PermissionLevel | undefined): Promise<void> {
    if (!session.wired) {
      this.workspace = level
      this.level = level ?? this.global
      return
    }

    await session.invoke('setWorkspacePermission', { workspaceId: this.#workspaceId, level })
    await this.load(this.#workspaceId, this.#threadId)
  }

  /** Steps the focused thread's own level. Returns what it became, so the
   *  caller can say so. */
  async setThread(level: PermissionLevel | undefined): Promise<PermissionLevel> {
    if (!session.wired) {
      this.thread = level
      this.level = level ?? this.workspace ?? this.global
      return this.level
    }

    const { level: now, thread } = await session.invoke('setThreadPermission', {
      threadId: this.#threadId,
      workspaceId: this.#workspaceId,
      level,
    })
    this.thread = thread
    this.level = now
    return now
  }

  /** What the thread's level would become next. */
  get pendingThread(): PermissionLevel | undefined {
    return nextLevel(this.thread)
  }

  /** Steps this thread's level, asking first on the way into full access.
   *
   *  Only on the way in: a confirmation for becoming *more* careful is a dialog
   *  that teaches the reader to dismiss dialogs. Nothing is announced after —
   *  the status bar already names the level, and a toast for something already
   *  on screen trains the reader to ignore the corner. */
  async cycleThread(): Promise<void> {
    const next = this.pendingThread
    if (next === 'full' && !(await this.#allowFull('thread'))) return
    await this.setThread(next)
  }

  /** Steps the workspace's level, with the same question on the same step. */
  async cycleWorkspace(): Promise<void> {
    const next = this.pending
    if (next === 'full' && !(await this.#allowFull('workspace'))) return
    await this.set(next)
  }

  #allowFull(scope: 'thread' | 'workspace'): Promise<boolean> {
    const returns =
      scope === 'thread'
        ? ' It returns to the workspace level when the app closes.'
        : ''
    return confirm.ask({
      title: 'full access',
      message:
        `This ${scope} will stop asking before anything — deleting files, pushing branches, ` +
        'writing outside the folder. There is no sandbox here, so the agent can do whatever ' +
        `you can.${returns}`,
      confirmLabel: 'allow',
    })
  }
}

export const permission = new PermissionState()
