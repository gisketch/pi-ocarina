/** `spawn_agents`: handing a scoped piece of work to a child agent.
 *
 *  Registered in every session this app starts, beside the approval gate and
 *  `ask_user`. A child is an in-process session with no file of its own; its
 *  tool calls appear nested under this call's row, and its final message is the
 *  whole of what comes back.
 *
 *  The description is the product. A tool that fans out for everything burns
 *  money on work one agent could have done; one that never fans out leaves the
 *  parent holding a context it did not need. */

// A devDependency on purpose — see the note in `ask-tool.ts`.
import { Type, type Static } from 'typebox'
import type { AgentEntry, AgentRole, SpawnRequest } from '../../shared/vocabulary'
import { MAX_PER_CALL, type AgentFleet, type ParentRef } from './agent-fleet'
import { faultInSpawn, planSpawn } from './spawn-plan'
import type { ThreadHandle } from './session-factory'

const DESCRIPTION = `Hand scoped work to child agents that run at the same time as each other.

Each child starts with a fresh context, does what its task says, and reports back in one message. It cannot see this conversation, so its task must contain everything it needs. You cannot talk to it again once it starts.

Use this when the work splits into parts that do not depend on each other — several places to search, several files to change, a change and its review. Do not use it for work that must happen in order, for a single small edit, or when you already have what you need.

Name a role for each child. A role decides its instructions, the tools it may use and the model it runs on. You may narrow its tools and change its model; you cannot give it a tool its role does not have.

Every child needs a short label: that is what the reader sees while it runs.`

/** The roles, written into the description.
 *
 *  A model cannot name a role it has never been shown. Proven live: told to
 *  "use the scout role", it wrote an inline prompt instead, because nothing in
 *  the tool said `scout` existed. The list is built when the session is, so a
 *  role added afterwards is spawnable — validation reads the store fresh — but
 *  is not advertised until the next session. */
function rolesIn(roles: readonly AgentRole[]): string {
  if (roles.length === 0) {
    return '\n\nNo roles are configured. Give `instructions` inline; such a child gets read-only tools.'
  }

  const lines = roles.map((role) => {
    const summary = role.instructions.split('\n')[0].slice(0, 100)
    return `- ${role.name} (${role.tools.join(', ') || 'no tools'}): ${summary}`
  })
  return `\n\nConfigured roles:\n${lines.join('\n')}`
}

const AGENT = Type.Object({
  role: Type.Optional(
    Type.String({ description: 'A configured role. Omit only if you give `instructions`.' }),
  ),
  instructions: Type.Optional(
    Type.String({
      description:
        'A system prompt for a one-off child, when no role fits. It gets read-only tools.',
    }),
  ),
  task: Type.String({
    description: 'Everything this child needs. It sees nothing else — no history, no context.',
  }),
  label: Type.String({ description: 'Short line for its row, e.g. "find every caller of X".' }),
  model: Type.Optional(Type.String({ description: 'Overrides the role, as provider/id.' })),
  tools: Type.Optional(
    Type.Array(Type.String(), { description: "Narrows the role's tools. Cannot add to them." }),
  ),
})

const PARAMETERS = Type.Object({
  agents: Type.Array(AGENT, { minItems: 1, description: 'The children to run.' }),
})

/** What the model reads when the call comes back. */
export interface SpawnResult {
  agents: AgentEntry[]
  /** What was asked for and not given — a dropped tool, a queued child. */
  warnings?: string[]
  /** Set instead of `agents` when the call itself was malformed. */
  error?: string
}

export interface SpawnDeps {
  fleet: AgentFleet
  handle: ThreadHandle
  /** Read fresh on every call, so a role added in settings is spawnable without
   *  a restart. */
  roles: () => AgentRole[]
  names: () => string[]
  /** Where the child runs and which workspace's rules apply to it. */
  where: () => { workspaceId: string; cwd: string }
  /** How deep the agent holding this tool is: 0 for a thread, 1 for a child.
   *  A child of a child never gets the tool at all. */
  depth: number
}

/** The tool's name, needed by anything that has to hand it to a session by
 *  name — pi filters custom tools by the `tools` list too. */
export const SPAWN_TOOL = 'spawn_agents'

export function spawnAgentsTool(deps: SpawnDeps) {
  return {
    name: SPAWN_TOOL,
    label: 'Agents',
    description: DESCRIPTION + rolesIn(deps.roles()),
    promptSnippet: 'spawn_agents — hand independent work to child agents',
    promptGuidelines: [
      'Prefer one child per independent piece of work, in a single call, over a run of separate calls.',
      "A child cannot see this conversation. Anything it needs goes in its task, including paths and names you consider obvious.",
    ],
    parameters: PARAMETERS,
    executionMode: 'parallel' as const,
    execute: async (
      toolCallId: string,
      params: Static<typeof PARAMETERS>,
      signal: AbortSignal | undefined,
    ) => {
      const roles = deps.roles()
      const asked = (params?.agents ?? []) as SpawnRequest[]

      if (asked.length === 0) return said({ agents: [], error: 'spawn_agents needs an agent' })
      if (asked.length > MAX_PER_CALL) {
        return said({
          agents: [],
          error: `one call may start at most ${MAX_PER_CALL} agents; asked for ${asked.length}`,
        })
      }

      for (const one of asked) {
        const fault = faultInSpawn(one, roles)
        // The whole call is refused rather than part of it: a model that got
        // one child wrong will fix the sentence and call again, and half a
        // fan-out is worse than none.
        if (fault !== null) return said({ agents: [], error: fault })
      }

      const where = deps.where()
      const parent: ParentRef = {
        threadId: deps.handle.threadId,
        workspaceId: where.workspaceId,
        cwd: where.cwd,
        toolCallId,
        depth: deps.depth,
      }

      const plans = asked.map((one) => planSpawn(one, roles))
      const pool = deps.names()
      const raised: string[] = []
      const entries = await Promise.all(
        plans.map((plan) =>
          deps.fleet.run(parent, plan, pool, signal, (warning) => raised.push(warning)),
        ),
      )

      const warnings = [...plans.flatMap((plan) => plan.warnings), ...raised]
      return said({ agents: entries, ...(warnings.length > 0 ? { warnings } : {}) })
    },
  }
}

/** pi wants content blocks; the model wants JSON. Both, once. */
function said(result: SpawnResult): { content: { type: 'text'; text: string }[]; details: unknown } {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
}
