/** What a tool call is called, and what its row says it acted on.
 *
 *  Split from the translator because this is the ledger's vocabulary rather
 *  than pi's event shapes, and because the two questions it answers — which row
 *  a tool gets, and what goes in its label — are the ones a reader looks up when
 *  a row reads wrong. */

import type { ToolKind } from '../../shared/vocabulary'

/** pi's tool names mapped onto the design's row vocabulary.
 *
 *  `find` and `ls` have no equivalent row in the design, so they stay `raw`
 *  rather than being dressed up as a grep or a read. A raw row is honest and
 *  still renders; a mislabelled one quietly lies about what the agent did. */
const TOOL_KINDS: Readonly<Record<string, ToolKind>> = {
  read: 'read',
  write: 'write',
  edit: 'edit',
  bash: 'bash',
  grep: 'grep',
  fetch: 'fetch',
  todo: 'todo',
  skill: 'skill',
  agent: 'agent',
  // This app's own tool. The children it starts nest under this row, so the
  // row that holds them has to read as the fan-out it is rather than as a
  // `raw` row with a page of JSON in it.
  spawn_agents: 'agent',
}

export function toolKind(name: string): ToolKind {
  return TOOL_KINDS[name] ?? 'raw'
}

/** The row's primary label: the thing the tool acted on. */
export function toolTarget(name: string, args: unknown): string {
  const input = (args ?? {}) as Record<string, unknown>
  const pick = (key: string): string | undefined =>
    typeof input[key] === 'string' ? (input[key] as string) : undefined

  // The spawn call's row says how many children it started; each of them has a
  // row of its own underneath saying what it is.
  if (name === 'spawn_agents') {
    const agents = Array.isArray(input.agents) ? input.agents.length : 0
    return agents === 1 ? 'spawn 1 agent' : `spawn ${agents} agents`
  }

  // A fetch row is the method and the address, with the scheme dropped: it is
  // always http or https, and the row is short. A GET says nothing about its
  // method, because that is the one the reader assumes.
  if (name === 'fetch') {
    const raw = pick('url') ?? ''
    const method = (pick('method') ?? 'GET').toUpperCase()
    const said = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (said !== '') return method === 'GET' ? said : `${method} ${said}`
  }

  // A search is what it looked for, not where it looked. `path` came first for
  // every tool, so `grep {pattern: 'export', path: '.'}` drew a row reading
  // `grepped .` — the one word the reader wanted was the one thrown away.
  // Written the way the design draws it: the pattern, then where, when where is
  // worth saying.
  if (name === 'grep' || name === 'find') {
    const pattern = pick('pattern') ?? pick('query')
    if (pattern) {
      const where = pick('path')
      const said = where && where !== '.' ? `"${pattern}" · ${where}` : `"${pattern}"`
      // `find` has no row of its own in the design, so its label is `tool` and
      // the name has to ride in the target or the row says nothing.
      return toolKind(name) === 'raw' ? `${name} ${said}` : said
    }
  }

  const target =
    pick('path') ?? pick('file_path') ?? pick('command') ?? pick('pattern') ?? pick('url')

  // A tool with no row of its own in the design is labelled `tool`, so its
  // target has to carry the name or the row says nothing at all: `ls .` read as
  // `tool .`.
  if (target) return toolKind(name) === 'raw' ? `${name} ${target}` : target

  // Unknown tool with nothing recognisable in its arguments.
  const summary = Object.keys(input).length > 0 ? ` ${JSON.stringify(input).slice(0, 80)}` : ''
  return `${name}${summary}`
}
