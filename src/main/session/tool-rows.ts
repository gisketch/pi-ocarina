/** What a tool call is called, and what its row says it acted on.
 *
 *  Split from the translator because this is the ledger's vocabulary rather
 *  than pi's event shapes, and because the two questions it answers — which row
 *  a tool gets, and what goes in its label — are the ones a reader looks up when
 *  a row reads wrong. */

import type { ToolKind } from '../../shared/vocabulary'
import { langOf } from '../../shared/lang-of'

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
  // The language-server tools get a row of their own. They borrowed `grep`
  // at first and the ledger then said `grepped outline src/app.ts` for a call
  // that asked the compiler — the row claimed the exact thing these tools
  // exist to replace.
  lsp_symbols: 'lsp',
  lsp_diagnostics: 'lsp',
  lsp_definition: 'lsp',
  lsp_references: 'lsp',
  lsp_hover: 'lsp',
  lsp_rename_preview: 'lsp',
}

/** The operation each language-server row names, drawn muted after its
 *  subject.
 *
 *  A noun, not a verb phrase. The row is `lsp · withRetry · references · 6
 *  refs · 3 files`: the gutter says which tool family, the subject says what
 *  was asked about, and this says what was asked. The sentence form it
 *  replaced (`asked definition of draw`) spent the row's width on grammar
 *  instead of on the two words a reader scans for. */
const LSP_OPERATIONS: Readonly<Record<string, string>> = {
  lsp_symbols: 'outline',
  lsp_diagnostics: 'diagnostics',
  lsp_definition: 'definition',
  lsp_references: 'references',
  lsp_hover: 'type',
  lsp_rename_preview: 'rename',
}

/** The language of the file a call acted on, or none.
 *
 *  From the arguments rather than from the row's target: an lsp row's target
 *  is a *symbol* on half the tools, and by the time anything downstream sees
 *  the row the path it came from is gone. */
export function toolLang(args: unknown): string {
  const input = (args ?? {}) as Record<string, unknown>
  const path = input.path ?? input.file_path
  return typeof path === 'string' ? langOf(path) : ''
}

/** The muted word a row draws after its target, or none.
 *
 *  Only the language-server rows have one today. It is a separate field rather
 *  than part of the target because the two are drawn in different strengths —
 *  the subject is what the reader scans, the operation is context. */
export function toolDetail(name: string): string | undefined {
  return LSP_OPERATIONS[name]
}

/** The last segment of a path — what a row shows when the directory is noise.
 *
 *  An lsp row's subject competes for width with its operation and its result,
 *  and `src/features/telemetry-widgets/components/WidgetLabPage.tsx` crowds
 *  both out. The full path is one expand away in the body. */
function baseName(path: string): string {
  const at = path.lastIndexOf('/')
  return at === -1 ? path : path.slice(at + 1)
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

  // A language-server row's target is its *subject*: the symbol when the tool
  // takes one, the file when it does not. The operation is drawn beside it as
  // detail, and the count is drawn as meta, so all three are legible at a
  // glance instead of competing inside one string.
  if (LSP_OPERATIONS[name]) {
    const symbol = pick('symbol')
    if (symbol) return symbol
    const where = pick('path')
    if (where) return baseName(where)
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
