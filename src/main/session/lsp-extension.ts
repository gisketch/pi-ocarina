/** What a session gains when its workspace has language servers.
 *
 *  Two halves. The six tools, so the agent can ask the compiler. And a
 *  subscription to `tool_result`, so an edit that broke the build says so in
 *  the same turn — the agent finds out without spending a call, which is the
 *  difference between a rule it follows and a rule it is told about. */

import type { WorkspaceLsp } from '../../shared/lsp'
import { lspTools } from '../lsp/tools'
import { injectionFor } from '../lsp/report'
import type { LspPool } from '../lsp/pool'

/** How the grep and find descriptions read while language servers are on.
 *
 *  Prefixed rather than replaced: the tool still does what it did, and a
 *  description that lied about that would be worse than no demotion at all.
 *  This is the second of the three layers — a description alone loses to a
 *  model's habits, as `spawn_agents` proved. */
export const FALLBACK_NOTE =
  'This project has language servers, and they answer questions about code better than this tool can. Use lsp_definition, lsp_references, lsp_symbols and lsp_hover for anything about a symbol — where it is defined, what uses it, what its type is. Use this tool for what a language server cannot see: strings, comments, configuration, documentation, and files in languages with no server.\n\n'

export function demote(description: string): string {
  return FALLBACK_NOTE + description
}

/** The system prompt line naming the live languages.
 *
 *  Third layer. Empty when nothing is enabled, so a workspace without LSP
 *  carries no sentence about it. */
export function promptLine(labels: readonly string[]): string {
  if (labels.length === 0) return ''
  const list = labels.join(', ')
  return `This project has language servers running for: ${list}. Use the lsp_ tools to find where symbols are defined, what uses them, and whether a file compiles. Reach for grep only when a language server cannot answer — strings, comments, configuration, and files in other languages.`
}

/** A tool result the handler may add to. pi's own event, narrowed to what is
 *  read and written here. */
export interface ResultEvent {
  toolName: string
  input: Record<string, unknown>
  content: { type: string; text?: string }[]
  isError: boolean
}

export interface InjectionDeps {
  pool: LspPool
  cwd: string
  settings: () => WorkspaceLsp | undefined
}

const CHANGING = new Set(['edit', 'write'])

/** Appends a changed file's errors to the result of the call that changed it.
 *
 *  Only when a server for that file is *already* up. Starting one here would
 *  put a cold start — seconds, for a type-checker — in the path of a write the
 *  user is waiting on, to answer a question nobody asked. */
export async function injectDiagnostics(
  deps: InjectionDeps,
  event: ResultEvent,
): Promise<string> {
  if (!CHANGING.has(event.toolName) || event.isError) return ''

  const raw = event.input.path ?? event.input.file_path
  const path = typeof raw === 'string' ? raw : ''
  if (path === '') return ''

  const full = path.startsWith('/') ? path : `${deps.cwd}/${path}`
  if (!deps.pool.isRunning(full)) return ''

  try {
    const diagnostics = await deps.pool.withClient(full, deps.settings(), (client) =>
      client.diagnostics(full),
    )
    return injectionFor(diagnostics, path)
  } catch {
    // A server that failed while reporting on an edit must not fail the edit.
    return ''
  }
}

/** Adds the note to the last text block of a result, or a new one. */
export function appendNote(event: ResultEvent, note: string): void {
  if (note === '') return

  for (let i = event.content.length - 1; i >= 0; i -= 1) {
    const block = event.content[i]
    if (block.type === 'text' && typeof block.text === 'string') {
      block.text += note
      return
    }
  }
  event.content.push({ type: 'text', text: note.trimStart() })
}

export interface LspExtensionDeps extends InjectionDeps {
  /** Labels of the servers that are both enabled and plausible *here*, for the
   *  prompt line.
   *
   *  Asynchronous because plausibility is a question about the disk. Naming
   *  every enabled server instead would tell a TypeScript repository that it
   *  has Go and Rust servers running, which is false and would send the agent
   *  looking for tools that will refuse it. */
  labels: () => Promise<string[]>
}

/** The tools, ready to register. */
export function lspToolsFor(deps: LspExtensionDeps) {
  return lspTools({ pool: deps.pool, cwd: deps.cwd, settings: deps.settings })
}
