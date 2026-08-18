/** Writing the shipped roles, names and voices — once each, and never again.
 *
 *  Separate markers, not one. Every catalog that predates modes is already
 *  seeded for roles, so a shared flag would mean no existing install ever saw
 *  the shipped voice — which is the one case seeding exists for.
 *
 *  A marker is what makes it once: an empty list is otherwise
 *  indistinguishable from a list the reader cleared, and every launch would put
 *  the defaults back under them. */

import { DEFAULT_NAME_POOL, DEFAULT_ROLES } from '../shared/agent-roles'
import { SHIPPED_MODES } from '../shared/chat-modes'
import type { CatalogState } from './catalog'

/** Seeds what has never been seeded. Returns whether anything was written. */
export function seedDefaults(state: CatalogState): boolean {
  let wrote = false

  if (!state.seeded) {
    state.roles = DEFAULT_ROLES.map((role) => ({ ...role, tools: [...role.tools] }))
    state.namePool = [...DEFAULT_NAME_POOL]
    state.seeded = true
    wrote = true
  }

  if (!state.seededModes) {
    state.modes = SHIPPED_MODES.map((mode) => ({ ...mode }))
    state.seededModes = true
    wrote = true
  }

  return wrote
}
