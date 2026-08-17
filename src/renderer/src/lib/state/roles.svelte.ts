/** The roles a child agent can be spawned as, as the settings screen sees them.
 *
 *  Main owns the catalog; this is a copy the screen edits and writes back. It is
 *  loaded when the screen opens rather than held forever, because roles change
 *  rarely and a stale copy is worse than a round trip.
 *
 *  A role added here is spawnable in the same session: the tool resolves roles
 *  from the store on every call. It is not *advertised* until the next session —
 *  the tool's description lists the roles pi was shown when it built the
 *  session, and pi reads a description once. */

import { DEFAULT_NAME_POOL, DEFAULT_ROLES } from '../../../../shared/agent-roles'
import { session } from '../session'
import type { AgentRole } from '../thread'

class Roles {
  roles = $state.raw<AgentRole[]>([])
  names = $state.raw<string[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  async load(): Promise<void> {
    // The browser harness has no backend. Showing the shipped roles there is
    // what makes the screen reviewable at all; an error where four roles belong
    // says nothing about whether the screen works.
    if (!session.wired) {
      this.roles = DEFAULT_ROLES.map((role) => ({ ...role, tools: [...role.tools] }))
      this.names = [...DEFAULT_NAME_POOL]
      return
    }

    this.loading = true
    this.error = null
    try {
      const { roles, names } = await session.invoke('listRoles', {})
      this.roles = roles
      this.names = names
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      this.loading = false
    }
  }

  /** Adds a role, or replaces the one with the same id. */
  async save(role: AgentRole): Promise<void> {
    if (!session.wired) {
      const kept = this.roles.filter((one) => one.id !== role.id)
      this.roles = [...kept, role]
      return
    }
    await session.invoke('saveRole', { role })
    await this.load()
  }

  /** Deletes a role.
   *
   *  No guard for a role a child is using: a running child already holds its
   *  instructions and is unaffected, and a child that spawns after the deletion
   *  gets the tool's own "no role named …" error, which names the roles that do
   *  exist. A guard here would protect nothing and would need a live-children
   *  query the settings screen has no other use for. */
  async remove(roleId: string): Promise<void> {
    if (!session.wired) {
      this.roles = this.roles.filter((one) => one.id !== roleId)
      return
    }
    await session.invoke('deleteRole', { roleId })
    await this.load()
  }

  async setNames(names: string[]): Promise<void> {
    await session.invoke('setNamePool', { names })
    await this.load()
  }

  /** An id for a role the user is adding. Derived from the name so a role file
   *  read by a person is legible, and suffixed when the name is taken. */
  idFor(name: string): string {
    // Trimmed of its own separators as well as of spaces: a name that is all
    // punctuation would otherwise become the id `-`, which is truthy and so
    // slips past the fallback.
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'role'
    if (!this.roles.some((role) => role.id === base)) return base

    let at = 2
    while (this.roles.some((role) => role.id === `${base}-${at}`)) at += 1
    return `${base}-${at}`
  }
}

export const roles = new Roles()
