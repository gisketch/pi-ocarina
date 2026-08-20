/** Tying the fleet and the factory that builds its children together.
 *
 *  Its own file because it is a wiring concern, not a fan-out one: the fleet
 *  runs children, and this is the one knot that has to be tied because a child
 *  is a session and a session may spawn children. Nothing here knows how a
 *  child runs, and the fleet does not know who wired it. */

import type { EmitEvent } from '../../shared/protocol'
import type { AgentRole } from '../../shared/vocabulary'
import { AgentFleet } from './agent-fleet'
import type { ChildFactory } from './agent-types'

/** What this hands back, named here so a caller needs one import, not two. */
export type { AgentFleet } from './agent-fleet'

/** Builds a fleet and hands it back to the factory that will build its children.
 *
 *  A child is a session and a session may spawn children, so the two are
 *  mutually dependent and one of them has to be wired after construction. Here
 *  rather than in the driver's constructor, which is already a list of six
 *  things being stood up in order. */
export function fleetFor(
  sessions: ChildFactory & {
    enableSpawning: (deps: {
      fleet: AgentFleet
      roles: () => AgentRole[]
      names: () => string[]
    }) => void
  },
  emit: EmitEvent,
  catalog: { roles: () => AgentRole[]; namePool: () => string[] },
  wasBlocked: (toolCallId: string) => boolean = () => false,
): AgentFleet {
  const fleet = new AgentFleet(sessions, emit, wasBlocked)
  sessions.enableSpawning({
    fleet,
    // Read fresh on every call, so a role added in settings is spawnable
    // without restarting the app.
    roles: () => catalog.roles(),
    names: () => catalog.namePool(),
  })
  return fleet
}
