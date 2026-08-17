/** The four commands the roles screen issues.
 *
 *  Split from the driver's own switch because they are about the catalog rather
 *  than about running a turn, and the driver was already the longest file in
 *  main. Main stays the only writer: the renderer sends a role and never a
 *  catalog. */

import type { CatalogStore } from '../catalog-store'
import type { CommandName, CommandParams } from '../../shared/commands'

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
      catalog.saveRole(role)
      return { ok: true }
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
