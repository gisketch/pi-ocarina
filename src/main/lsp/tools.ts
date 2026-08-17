/** The six tools a model gets when a workspace has language servers.
 *
 *  Every one of them takes a path and a symbol *name*. LSP speaks in line and
 *  character; a model does not know columns, and making it guess costs a read
 *  of the file — which is the cost these tools exist to remove. */

// A devDependency on purpose — see the note in `ask-tool.ts`.
import { Type, type Static } from 'typebox'
import { isAbsolute, join, resolve } from 'node:path'
import type { WorkspaceLsp } from '../../shared/lsp'
import type { LspClient, Position } from './client'
import { describeAmbiguous, describeMissing, flatten, locate } from './locate'
import { describeDiagnostics, listLocations, where } from './report'
import { NoServerError, type LspPool } from './pool'

export const LSP_TOOLS = [
  'lsp_diagnostics',
  'lsp_definition',
  'lsp_references',
  'lsp_symbols',
  'lsp_hover',
  'lsp_rename_preview',
] as const

const GUIDELINES = [
  'This project has language servers. To find where a symbol is defined, what uses it, or what a name means, call the lsp_ tools. They answer from the compiler, not from a text match.',
  'Do not grep for a symbol. grep and find are for strings, comments, configuration, and files no language server covers.',
  'After changing a file, lsp_diagnostics tells you whether it still compiles.',
]

const FILE = Type.String({ description: 'Path to the file, relative to the workspace root.' })
const SYMBOL = Type.String({
  description: 'The name of the symbol, as written in the code. Not a line or a column.',
})

const AT = Type.Object({ path: FILE, symbol: SYMBOL })
const JUST_FILE = Type.Object({ path: FILE })
const RENAME = Type.Object({
  path: FILE,
  symbol: SYMBOL,
  newName: Type.String({ description: 'The name to try.' }),
})

export interface LspToolDeps {
  pool: LspPool
  cwd: string
  /** Read fresh, so switching a server off in settings takes effect at once. */
  settings: () => WorkspaceLsp | undefined
}

/** pi's tool result, as these tools use it. `details` is what the ledger reads
 *  and the model never sees; for these it is the same text, so a row can say
 *  what was asked without re-deriving it. */
type Said = { content: { type: 'text'; text: string }[]; details: unknown }
const said = (text: string): Said => ({
  content: [{ type: 'text' as const, text }],
  details: undefined,
})

/** Resolves a model-supplied path, refusing anything outside the workspace.
 *
 *  A path is untrusted input even when a model wrote it, and these tools open
 *  files. `../../../etc/passwd` is a path. */
function inWorkspace(cwd: string, path: string): string | null {
  const full = resolve(isAbsolute(path) ? path : join(cwd, path))
  const root = resolve(cwd)
  return full === root || full.startsWith(`${root}/`) ? full : null
}

/** Everything the six share: resolve the file, get a server, find the symbol. */
async function at<T>(
  deps: LspToolDeps,
  path: string,
  symbol: string,
  work: (client: LspClient, position: Position, file: string) => Promise<T>,
  mutating = false,
): Promise<T | Said> {
  const file = inWorkspace(deps.cwd, path)
  if (!file) return said(`${path} is outside this workspace`)

  try {
    return await deps.pool.withClient(
      file,
      deps.settings(),
      async (client) => {
        const found = locate(await client.documentSymbols(file), symbol)
        if ('ambiguous' in found) return said(describeAmbiguous(symbol, found.ambiguous))
        if ('missing' in found) return said(describeMissing(symbol, found.available))
        return work(client, found.at.position, file)
      },
      mutating,
    )
  } catch (thrown) {
    return said(reason(thrown, path))
  }
}

/** A failure the model can act on, rather than a stack trace.
 *
 *  Naming grep as the way forward matters: a server that is missing or broken
 *  must not leave the agent with nothing to try. */
function reason(thrown: unknown, path: string): string {
  if (thrown instanceof NoServerError) {
    return `${thrown.message}. Use grep or read for this file.`
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  return `the language server failed on ${path}: ${message}. Use grep or read instead.`
}

export function lspTools(deps: LspToolDeps) {
  const tool = <P extends Parameters<typeof Type.Object>[0]>(
    name: string,
    label: string,
    description: string,
    parameters: ReturnType<typeof Type.Object<P>>,
    execute: (params: never) => Promise<Said>,
  ) => ({
    name,
    label,
    description,
    promptSnippet: `${name} — ${label.toLowerCase()}, from the language server`,
    promptGuidelines: GUIDELINES,
    parameters,
    executionMode: 'parallel' as const,
    execute: async (_id: string, params: never) => execute(params),
  })

  return [
    tool(
      'lsp_symbols',
      'Outline',
      'Every symbol a file declares, with its kind and line. Use this before reading a file — it is the file’s shape at a fraction of the cost.',
      JUST_FILE,
      async ({ path }: Static<typeof JUST_FILE>) => {
        const file = inWorkspace(deps.cwd, path)
        if (!file) return said(`${path} is outside this workspace`)
        try {
          return await deps.pool.withClient(file, deps.settings(), async (client) => {
            const all = flatten(await client.documentSymbols(file))
            if (all.length === 0) return said(`${path} declares no symbols`)
            return said(all.map((one) => `${path}:${one.line} ${one.kind} ${one.name}`).join('\n'))
          })
        } catch (thrown) {
          return said(reason(thrown, path))
        }
      },
    ),

    tool(
      'lsp_diagnostics',
      'Problems',
      'Compiler errors and warnings for a file. Call this after editing to find out whether the change compiles.',
      JUST_FILE,
      async ({ path }: Static<typeof JUST_FILE>) => {
        const file = inWorkspace(deps.cwd, path)
        if (!file) return said(`${path} is outside this workspace`)
        try {
          return await deps.pool.withClient(file, deps.settings(), async (client) =>
            said(describeDiagnostics(await client.diagnostics(file), path)),
          )
        } catch (thrown) {
          return said(reason(thrown, path))
        }
      },
    ),

    tool(
      'lsp_definition',
      'Definition',
      'Where a symbol is defined. Answers from the compiler, so it is right even when the name appears in a hundred other places.',
      AT,
      async ({ path, symbol }: Static<typeof AT>) =>
        at(deps, path, symbol, async (client, position, file) =>
          said(listLocations(await client.definition(file, position), deps.cwd, 'definitions')),
        ) as Promise<Said>,
    ),

    tool(
      'lsp_references',
      'References',
      'Every place a symbol is used. This is what to call before changing or deleting anything — grep finds the word, this finds the uses.',
      AT,
      async ({ path, symbol }: Static<typeof AT>) =>
        at(deps, path, symbol, async (client, position, file) =>
          said(listLocations(await client.references(file, position), deps.cwd, 'references')),
        ) as Promise<Said>,
    ),

    tool(
      'lsp_hover',
      'Type',
      'The type and documentation of a symbol, as the compiler sees it.',
      AT,
      async ({ path, symbol }: Static<typeof AT>) =>
        at(deps, path, symbol, async (client, position, file) => {
          const text = await client.hover(file, position)
          return said(text === '' ? `the server has nothing to say about ${symbol}` : text)
        }) as Promise<Said>,
    ),

    tool(
      'lsp_rename_preview',
      'Rename',
      'Every edit a rename would make, across the whole project. This previews only and changes nothing — apply the edits yourself with the edit tool.',
      RENAME,
      async ({ path, symbol, newName }: Static<typeof RENAME>) =>
        at(
          deps,
          path,
          symbol,
          async (client, position, file) => {
            const edits = await client.rename(file, position, newName)
            if (edits.length === 0) return said(`the server would not rename ${symbol}`)

            const lines = edits
              .map((one) => where(one, deps.cwd))
              .filter((one): one is string => one !== null)
            return said(
              `renaming ${symbol} to ${newName} would change ${lines.length} place${lines.length === 1 ? '' : 's'}:\n${lines.join('\n')}\n\nNothing has changed yet. Apply these with edit.`,
            )
          },
          // Never replayed against a fresh server: a rename applied twice is
          // worse than one that failed.
          true,
        ) as Promise<Said>,
    ),
  ]
}
