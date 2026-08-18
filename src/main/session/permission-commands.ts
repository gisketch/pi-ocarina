/** The four commands that read and set permission levels.
 *
 *  Split from the driver the way `handleLsp` and `handleRoles` are: the driver
 *  is a switch over every command in the app, and a group that owns two stores
 *  between them is a group that belongs in a file of its own.
 *
 *  Nothing here enforces anything. The gate does that, on every call, in main. */

import type { CommandName, CommandParams, CommandResult } from '../../shared/protocol'
import type { ApprovalGate } from './approvals'

interface Levels {
  describeLevel(workspaceId: string): {
    level: import('../../shared/permissions').PermissionLevel
    workspace?: import('../../shared/permissions').PermissionLevel
    global: import('../../shared/permissions').PermissionLevel
  }
  setLevel(
    workspaceId: string,
    level: import('../../shared/permissions').PermissionLevel | undefined,
  ): void
}

export function handlePermission<N extends CommandName>(
  catalog: Levels,
  gate: ApprovalGate,
  name: N,
  params: unknown,
): CommandResult<N> {
  switch (name) {
    case 'workspacePermission': {
      const { workspaceId } = params as CommandParams<'workspacePermission'>
      return catalog.describeLevel(workspaceId) as CommandResult<N>
    }

    case 'setWorkspacePermission': {
      const { workspaceId, level } = params as CommandParams<'setWorkspacePermission'>
      catalog.setLevel(workspaceId, level)
      return { ok: true } as CommandResult<N>
    }

    case 'threadPermission': {
      const { threadId, workspaceId } = params as CommandParams<'threadPermission'>
      return described(gate, threadId, workspaceId) as CommandResult<N>
    }

    default: {
      const { threadId, workspaceId, level } = params as CommandParams<'setThreadPermission'>
      gate.setThreadLevel(threadId, level)
      return described(gate, threadId, workspaceId) as CommandResult<N>
    }
  }
}

/** What a thread runs at, and whether that is its own answer or its
 *  workspace's. Both callers report the same shape, so both read it here. */
function described(gate: ApprovalGate, threadId: string, workspaceId: string) {
  const own = gate.threadLevel(threadId)
  return { level: gate.levelFor(threadId, workspaceId), ...(own !== undefined ? { thread: own } : {}) }
}
