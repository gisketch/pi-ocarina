/** The roles that ship, the names children are drawn from, and how both are
 *  read back off disk.
 *
 *  Shared rather than main-only because the settings screen edits the same
 *  shapes it validates, and a second definition there would drift from the one
 *  the spawn tool resolves against. */

import { READ_ONLY_TOOLS, type AgentRole } from './vocabulary'

/** What every role's instructions end with, whether the role is saved or
 *  inline.
 *
 *  Appended by the app rather than asked of the role text: the parent reads
 *  only the child's final message, and a user-authored role cannot be relied on
 *  to know that. Without it a child leaves its findings in a transcript nobody
 *  will ever read. */
export const CHILD_PREAMBLE = [
  'You are a subagent. Your final message is the whole of what the agent that',
  'spawned you will read — it cannot see your transcript, your tool calls, or',
  'anything you worked out along the way. Put everything it needs in that last',
  'message, including the findings you would otherwise assume are obvious from',
  'your work. Do not end with a question: nobody will answer it.',
].join(' ')

/** The four roles a fresh profile starts with.
 *
 *  The division is pi's own sample set: recon on a cheap model, planning and
 *  review that read without writing, and one role that holds everything. They
 *  are examples as much as defaults — reading four working roles teaches the
 *  shape faster than an empty form does. */
export const DEFAULT_ROLES: readonly AgentRole[] = [
  {
    id: 'scout',
    name: 'scout',
    instructions:
      'You find things in a codebase and report where they are. Read widely and ' +
      'cheaply. Report paths and line numbers, not opinions about the code.',
    tools: [...READ_ONLY_TOOLS, 'bash'],
    model: 'anthropic/claude-haiku-4-5',
  },
  {
    id: 'planner',
    name: 'planner',
    instructions:
      'You turn a goal into an ordered plan someone else can follow. Read enough ' +
      'to be concrete. Name files and functions. Do not write any code.',
    tools: [...READ_ONLY_TOOLS],
  },
  {
    id: 'reviewer',
    name: 'reviewer',
    instructions:
      'You review changes for defects. Report what is wrong, where, and what ' +
      'would go wrong because of it. Say plainly when you find nothing.',
    tools: [...READ_ONLY_TOOLS, 'bash'],
  },
  {
    id: 'developer',
    name: 'developer',
    instructions:
      'You carry out one scoped change and verify it. Follow the surrounding ' +
      'code. Report what you changed and what you ran to check it.',
    tools: [...READ_ONLY_TOOLS, 'write', 'edit', 'bash'],
  },
]

/** The names children are drawn from.
 *
 *  Greek myth by default, and editable: the pool is a setting, not a constant.
 *  A name is only ever borrowed for one spawn, so the pool need only be larger
 *  than the number of children alive at once. */
export const DEFAULT_NAME_POOL: readonly string[] = [
  'odysseus',
  'penelope',
  'circe',
  'calypso',
  'telemachus',
  'athena',
  'hermes',
  'poseidon',
  'zeus',
  'hera',
  'apollo',
  'artemis',
  'hephaestus',
  'demeter',
  'persephone',
  'orpheus',
  'eurydice',
  'perseus',
  'andromeda',
  'heracles',
  'theseus',
  'ariadne',
  'daedalus',
  'icarus',
  'jason',
  'medea',
  'atalanta',
  'cassandra',
  'hector',
  'achilles',
]

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function tools(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((one): one is string => typeof one === 'string' && one !== ''))]
}

/** Reads roles back off disk, dropping anything that cannot be run.
 *
 *  A role missing its id, name or instructions is not repairable — a role is
 *  only a system prompt, so a role without one is nothing. A role with no
 *  tools is kept: "may hold nothing" is a coherent ceiling, and guessing a
 *  tool set for it would grant what nobody granted. */
export function parseRoles(value: unknown): AgentRole[] {
  if (!Array.isArray(value)) return []

  const roles: AgentRole[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>

    const id = text(record.id)
    const name = text(record.name)
    const instructions = text(record.instructions)
    if (!id || !name || !instructions) continue
    if (seen.has(name)) continue
    seen.add(name)

    const model = text(record.model)
    roles.push({ id, name, instructions, tools: tools(record.tools), ...(model ? { model } : {}) })
  }
  return roles
}

/** Reads the name pool back, dropping duplicates and blanks. An empty pool is
 *  kept as empty rather than refilled: a user who cleared it meant to. */
export function parseNamePool(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((one): one is string => typeof one === 'string' && one !== ''))]
}
