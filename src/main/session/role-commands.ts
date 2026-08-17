/** The commands that only touch stored state — the roles screen's four, and
 *  hiding or restoring a thread.
 *
 *  Split from the driver's own switch because they are about the catalog rather
 *  than about running a turn, and the driver was already the longest file in
 *  main. Main stays the only writer: the renderer sends a role and never a
 *  catalog. */

import type { CatalogStore } from '../catalog-store'
import type { CommandName, CommandParams } from '../../shared/commands'

/** Just enough of the workspace service to hide and restore a thread. */
interface Archivable {
  setArchived: (threadId: string, archived: boolean) => Promise<void>
}

export function handleRoles(
  catalog: CatalogStore,
  name: CommandName,
  params: unknown,
): unknown {
  switch (name) {
    case 'listRoles':
      return { roles: catalog.roles(), names: catalog.namePool() }

    case 'saveRole': {
      const { role } = params as CommandParams<'saveRole'>
      return catalog.saveRole(role)
    }

    case 'deleteRole': {
      const { roleId } = params as CommandParams<'deleteRole'>
      catalog.deleteRole(roleId)
      return { ok: true }
    }

    case 'setNamePool': {
      const { names } = params as CommandParams<'setNamePool'>
      catalog.setNamePool(names)
      return { ok: true }
    }

    default:
      throw new Error(`not a roles command: ${name}`)
  }
}

/** Hides a thread from its workspace's strip, or brings it back. The session
 *  file is untouched — closing a thread is not deleting its history. */
export async function handleArchive(
  workspaces: Archivable,
  name: CommandName,
  params: unknown,
): Promise<{ ok: true }> {
  const { threadId } = params as CommandParams<'archiveThread'>
  await workspaces.setArchived(threadId, name === 'archiveThread')
  return { ok: true }
}
