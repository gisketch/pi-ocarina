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
import { session } from '../session'

class PermissionState {
  /** What is in force. */
  level = $state<PermissionLevel>(DEFAULT_PERMISSION)
  /** The workspace's own, when it has set one. Absent means it inherits. */
  workspace = $state<PermissionLevel | undefined>(undefined)
  global = $state<PermissionLevel>(DEFAULT_PERMISSION)

  #workspaceId = ''

  /** What the workspace row reads: its own level, or what it inherits. */
  get row(): string {
    const label = PERMISSION_LABELS[this.level]
    return this.workspace === undefined ? `inherit — ${label}` : label
  }

  async load(workspaceId: string): Promise<void> {
    this.#workspaceId = workspaceId
    if (!session.wired) return

    try {
      const described = await session.invoke('workspacePermission', { workspaceId })
      this.level = described.level
      this.workspace = described.workspace
      this.global = described.global
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
    await this.load(this.#workspaceId)
  }
}

export const permission = new PermissionState()
