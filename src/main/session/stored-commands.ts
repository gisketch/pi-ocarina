/** Commands that read or write stored state rather than run a turn.
 *
 *  Roles, permission levels, language servers, chat modes and what a project
 *  loaded. Each already had a handler of its own; this is the one place that
 *  knows which names belong to which, so the driver's switch stays about the
 *  agent.
 *
 *  Returns `null` for a name it does not own, which is how the driver tells
 *  "handled" from "not mine" without listing thirteen cases twice. */

import type { CommandName } from '../../shared/commands'
import type { CatalogStore } from '../catalog-store'
import type { ApprovalGate } from './approvals'
import { handleLsp, type LspService } from '../lsp/service'
import { handleModes, type ModeControl } from './mode-commands'
import { handlePermission } from './permission-commands'
import { handleProject, type ProjectDeps } from './project-commands'
import { handleRoles } from './role-commands'

const ROLES = new Set<CommandName>(['listRoles', 'saveRole', 'deleteRole', 'setNamePool'])
const MODES = new Set<CommandName>([
  'listModes',
  'setThreadMode',
  'setDefaultMode',
  'saveMode',
  'deleteMode',
])
const PERMISSION = new Set<CommandName>([
  'workspacePermission',
  'setWorkspacePermission',
  'threadPermission',
  'setThreadPermission',
])
const LSP = new Set<CommandName>(['workspaceLsp', 'setWorkspaceLsp'])
const PROJECT = new Set<CommandName>(['projectSurface', 'reloadProject'])

export interface StoredDeps {
  catalog: CatalogStore
  approvals: ApprovalGate
  lsp: LspService
  modes: ModeControl
  project: ProjectDeps
}

export function ownsStored(name: CommandName): boolean {
  return (
    ROLES.has(name) || MODES.has(name) || PERMISSION.has(name) || LSP.has(name) || PROJECT.has(name)
  )
}

export async function handleStored(
  deps: StoredDeps,
  name: CommandName,
  params: unknown,
): Promise<unknown> {
  if (ROLES.has(name)) return handleRoles(deps.catalog, name, params)
  if (MODES.has(name)) return handleModes(deps.modes, deps.catalog, name, params)
  if (PERMISSION.has(name)) return handlePermission(deps.catalog, deps.approvals, name, params)
  if (LSP.has(name)) return handleLsp(deps.lsp, name, params)
  return handleProject(deps.project, name, params)
}
