/** How the driver hands its collaborators to the two helpers that need most of
 *  them.
 *
 *  Both are plain assembly. Keeping them here rather than as methods leaves the
 *  driver reading as what it is — a command switch and the objects behind it —
 *  and puts the wiring in one place where a new collaborator is added once. */

import type { ApprovalGate } from './approvals'
import type { AgentFleet } from './agent-fleet'
import type { CatalogStore } from '../catalog-store'
import type { ChangeLog } from './change-log'
import type { EmitEvent } from '../../shared/protocol'
import type { HookEntry } from '../../shared/config-file'
import type { LspService } from '../lsp/service'
import type { ModeControl } from './mode-commands'
import type { ModelControl } from './model-control'
import type { SessionFactory } from './session-factory'
import type { StagedImages } from './staged-images'
import type { SteerQueue } from './steering'
import type { ThreadRegistry } from './thread-registry'
import type { WorkspaceService } from './workspaces'
import { hookRunnerFor } from './hook-rows'
import type { OpenDeps } from './thread-open'
import type { StoredDeps } from './stored-commands'

export interface DriverParts {
  emit: EmitEvent
  threads: ThreadRegistry
  fleet: AgentFleet
  models: ModelControl
  sessions: SessionFactory
  workspaces: WorkspaceService
  changes: ChangeLog
  steers: SteerQueue
  approvals: ApprovalGate
  staged: StagedImages
  catalog: CatalogStore
  lsp: LspService
  modes: ModeControl
  hooks: () => readonly HookEntry[]
}

export function openingDeps(parts: DriverParts): OpenDeps {
  return {
    emit: parts.emit,
    threads: parts.threads,
    fleet: parts.fleet,
    models: parts.models,
    sessions: parts.sessions,
    workspaces: parts.workspaces,
    changes: parts.changes,
    steers: parts.steers,
    takeBlocked: (toolCallId) => parts.approvals.takeBlocked(toolCallId),
    staged: (path) => parts.staged.owns(path),
    hooks: hookRunnerFor({
      hooks: parts.hooks,
      cwdOf: (id) => parts.workspaces.cwdOf(id),
      emit: parts.emit,
    }),
  }
}

export function storedDeps(parts: DriverParts): StoredDeps {
  return {
    catalog: parts.catalog,
    approvals: parts.approvals,
    lsp: parts.lsp,
    modes: parts.modes,
    project: {
      session: (threadId) => parts.threads.get(threadId).session,
      cwdOf: (threadId) => parts.workspaces.cwdOf(threadId),
      sdk: () => parts.sessions.load(),
    },
  }
}
