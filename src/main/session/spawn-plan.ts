/** Turning what the orchestrator asked for into what a child will actually be.
 *
 *  Pure, and separate from the fleet that runs children, because this is where
 *  every rule about what a child may hold lives: the role it resolves to, the
 *  ceiling on its tools, and the model it runs on. A rule that can be read
 *  without starting a session is a rule that can be tested without one. */

import { CHILD_PREAMBLE, NO_DEEPER } from '../../shared/agent-roles'
import { READ_ONLY_TOOLS, type AgentRole, type SpawnRequest } from '../../shared/vocabulary'

/** The name a child's row and envelope carry when the orchestrator wrote its
 *  prompt rather than naming a saved role. */
export const INLINE = 'inline'

export interface Plan {
  /** What the row and the envelope call it. */
  role: string
  label: string
  task: string
  /** The child's whole system prompt: its role's text, then the preamble that
   *  tells it its last message is all anyone will read. */
  instructions: string
  /** Exactly what it may call. Already narrowed. */
  tools: string[]
  /** Absent means the parent's model. */
  model?: string
  /** Whether this child may spawn children of its own, if it is shallow enough.
   *
   *  A saved role may; an inline prompt may not. Otherwise an inline child —
   *  the least-vetted thing in the system, held to read-only tools by decision
   *  13 — could start a `developer` child and write through it. */
  spawns: boolean
  /** Things the orchestrator asked for and did not get, said plainly enough
   *  that it can ask differently next time. */
  warnings: string[]
}

/** A spawn the model asked for badly. Returned rather than thrown: a model can
 *  fix a sentence, and a throw reads to it as the tool being broken. */
export function faultInSpawn(request: unknown, roles: readonly AgentRole[]): string | null {
  const spawn = request as Partial<SpawnRequest> | null
  if (typeof spawn !== 'object' || spawn === null) return 'each agent must be an object'

  if (typeof spawn.task !== 'string' || spawn.task.trim() === '') {
    return 'every agent needs a task'
  }
  if (typeof spawn.label !== 'string' || spawn.label.trim() === '') {
    return 'every agent needs a short label for its row'
  }

  const named = typeof spawn.role === 'string' && spawn.role !== ''
  const written = typeof spawn.instructions === 'string' && spawn.instructions.trim() !== ''

  if (named && written) return 'name a role or give instructions, not both'
  if (!named && !written) {
    return `name a role or give instructions. Roles: ${listOf(roles)}`
  }

  if (named && !roles.some((role) => role.name === spawn.role)) {
    return `no role named "${String(spawn.role)}". Roles: ${listOf(roles)}`
  }
  return null
}

/** What the child will be. Call only on a request that has no fault.
 *
 *  `depth` is the spawning agent's own: a child of a child is told it cannot
 *  spawn, rather than being left to look for a tool that is not there. */
export function planSpawn(
  request: SpawnRequest,
  roles: readonly AgentRole[],
  depth = 0,
): Plan {
  const role = request.role ? roles.find((one) => one.name === request.role) : undefined
  const warnings: string[] = []

  // An inline prompt is the least-vetted thing in the system, so it takes the
  // least: the read-only set, and no way to widen it. Writing needs a role
  // somebody wrote down.
  const ceiling = role ? role.tools : [...READ_ONLY_TOOLS]
  const tools = narrow(request.tools, ceiling, warnings)

  return {
    role: role?.name ?? INLINE,
    label: request.label.trim(),
    task: request.task.trim(),
    instructions: [
      (role?.instructions ?? request.instructions ?? '').trim(),
      CHILD_PREAMBLE,
      // The child being planned is at `depth + 1`; if it cannot spawn, say so.
      depth + 1 >= 2 || role === undefined ? NO_DEEPER : '',
    ]
      .filter((part) => part !== '')
      .join('\n\n'),
    tools,
    ...(request.model ?? role?.model ? { model: request.model ?? role?.model } : {}),
    spawns: role !== undefined,
    warnings,
  }
}

/** The ceiling rule, in one place: a request may remove from the role's tools
 *  and may never add to them.
 *
 *  Anything asked for and not on the list is dropped rather than granted, and
 *  said out loud — a `scout` handed `bash` would still be labelled `scout` in
 *  the row, and `scout` is the name the reader trusts to be read-only. */
function narrow(asked: string[] | undefined, ceiling: string[], warnings: string[]): string[] {
  if (!asked) return [...ceiling]

  const kept = asked.filter((tool) => ceiling.includes(tool))
  const refused = asked.filter((tool) => !ceiling.includes(tool))

  if (refused.length > 0) {
    warnings.push(
      `dropped ${refused.join(', ')}: a spawn may narrow a role's tools, never widen them`,
    )
  }
  // Asking for nothing that exists leaves a child that can call nothing, which
  // is a coherent thing to be and is not silently repaired into the full set.
  return kept
}

function listOf(roles: readonly AgentRole[]): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(', ') : 'none configured'
}
