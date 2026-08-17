/** One language server, spoken to over stdio.
 *
 *  `vscode-jsonrpc` owns the wire — framing, request correlation, cancellation
 *  — because those are easy to get subtly wrong and it carries no dependencies
 *  of its own. Everything above the wire is ours, which is what lets the status
 *  bar and the settings screen see real server state rather than a black box.
 *
 *  This file knows nothing about pi, workspaces or pools. It starts a process
 *  and asks it questions. */

import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import type { LspServerSpec } from '../../shared/lsp'

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface Symbol {
  name: string
  kind: number
  range: Range
  selectionRange: Range
  children?: Symbol[]
  /** Set by servers that answer with the flat `SymbolInformation` shape. */
  location?: Location
}

export interface Diagnostic {
  range: Range
  severity?: number
  message: string
  source?: string
}

/** How long to wait for a server to publish diagnostics for a file it was just
 *  handed. Long enough for a type-checker to answer, short enough that a silent
 *  server does not hold an edit open. */
const DIAGNOSTIC_WAIT_MS = 4_000

/** Open documents are held so positional requests work; a long session would
 *  otherwise hand the server every file it ever touched. */
const MAX_OPEN = 100

const SYMBOL_KINDS: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  23: 'struct',
  26: 'type',
}

export const symbolKind = (kind: number): string => SYMBOL_KINDS[kind] ?? 'symbol'

export interface LspClient {
  readonly id: string
  documentSymbols(path: string): Promise<Symbol[]>
  definition(path: string, at: Position): Promise<Location[]>
  references(path: string, at: Position): Promise<Location[]>
  hover(path: string, at: Position): Promise<string>
  rename(path: string, at: Position, name: string): Promise<Location[]>
  diagnostics(path: string): Promise<Diagnostic[]>
  stop(): Promise<void>
}

const uriOf = (path: string): string => pathToFileURL(path).toString()

const asArray = <T,>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]

/** What a server sends back for `initialize`. Only the shape we act on. */
interface InitializeResult {
  capabilities?: Record<string, unknown>
}

export interface StartOptions {
  /** Injected in tests so a fake server can be driven without a binary. */
  spawnProcess?: typeof spawn
}

export async function startClient(
  spec: LspServerSpec,
  root: string,
  options: StartOptions = {},
): Promise<LspClient> {
  const launch = options.spawnProcess ?? spawn
  // No shell: a configured command is data from a settings file, and a shell
  // would make its arguments executable.
  const child: ChildProcess = launch(spec.command, spec.args, {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })

  if (!child.stdout || !child.stdin) {
    throw new Error(`${spec.command} started without a usable stdio pipe`)
  }
  // Drained rather than inherited: a server that logs heavily would otherwise
  // fill the app's own output with noise nobody asked for.
  child.stderr?.resume()

  const connection: MessageConnection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  )

  const published = new Map<string, Diagnostic[]>()
  const waiting = new Map<string, (diagnostics: Diagnostic[]) => void>()

  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string; diagnostics: Diagnostic[] }) => {
      published.set(params.uri, params.diagnostics ?? [])
      waiting.get(params.uri)?.(params.diagnostics ?? [])
    },
  )
  // Servers ask questions of their own. Answering nothing is fine; failing to
  // answer at all leaves some of them waiting forever.
  connection.onRequest('workspace/configuration', () => [null])
  connection.onRequest('client/registerCapability', () => null)
  connection.onRequest('window/workDoneProgress/create', () => null)
  connection.listen()

  await connection.sendRequest<InitializeResult>('initialize', {
    processId: process.pid,
    rootUri: uriOf(root),
    workspaceFolders: [{ uri: uriOf(root), name: root.slice(root.lastIndexOf('/') + 1) }],
    ...(spec.initialization ? { initializationOptions: spec.initialization } : {}),
    capabilities: {
      textDocument: {
        synchronization: { dynamicRegistration: false },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        definition: { linkSupport: false },
        references: {},
        hover: { contentFormat: ['markdown', 'plaintext'] },
        rename: { prepareSupport: false },
        publishDiagnostics: {},
      },
      workspace: { workspaceFolders: true, configuration: true },
    },
  })
  connection.sendNotification('initialized', {})

  /** Documents the server has been handed, newest last. */
  const open: string[] = []

  const ensureOpen = async (path: string): Promise<string> => {
    const uri = uriOf(path)
    if (open.includes(uri)) return uri

    const text = await readFile(path, 'utf8')
    connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: spec.id, version: 1, text },
    })
    open.push(uri)

    while (open.length > MAX_OPEN) {
      const oldest = open.shift()
      if (oldest) connection.sendNotification('textDocument/didClose', { textDocument: { uri: oldest } })
    }
    return uri
  }

  const positional = async <T,>(method: string, path: string, at: Position, extra = {}): Promise<T> => {
    const uri = await ensureOpen(path)
    return connection.sendRequest<T>(method, {
      textDocument: { uri },
      position: at,
      ...extra,
    })
  }

  return {
    id: spec.id,

    async documentSymbols(path) {
      const uri = await ensureOpen(path)
      const answer = await connection.sendRequest<Symbol[] | null>('textDocument/documentSymbol', {
        textDocument: { uri },
      })
      return answer ?? []
    },

    async definition(path, at) {
      return asArray(
        await positional<Location | Location[] | null>('textDocument/definition', path, at),
      ).map((one) => normalizeLocation(one))
    },

    async references(path, at) {
      return asArray(
        await positional<Location[] | null>('textDocument/references', path, at, {
          context: { includeDeclaration: false },
        }),
      ).map((one) => normalizeLocation(one))
    },

    async hover(path, at) {
      const answer = await positional<{ contents?: unknown } | null>(
        'textDocument/hover',
        path,
        at,
      )
      return hoverText(answer?.contents)
    },

    async rename(path, at, name) {
      const edit = await positional<{
        changes?: Record<string, { range: Range }[]>
        documentChanges?: { textDocument: { uri: string }; edits: { range: Range }[] }[]
      } | null>('textDocument/rename', path, at, { newName: name })

      const found: Location[] = []
      for (const [uri, edits] of Object.entries(edit?.changes ?? {})) {
        for (const one of edits) found.push({ uri, range: one.range })
      }
      for (const change of edit?.documentChanges ?? []) {
        for (const one of change.edits) found.push({ uri: change.textDocument.uri, range: one.range })
      }
      return found
    },

    async diagnostics(path) {
      const uri = await ensureOpen(path)
      const already = published.get(uri)
      if (already) return already

      // Diagnostics arrive as a notification whenever the server is ready, so
      // the only honest way to ask for them is to wait a bounded moment.
      return new Promise<Diagnostic[]>((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(uri)
          resolve(published.get(uri) ?? [])
        }, DIAGNOSTIC_WAIT_MS)

        waiting.set(uri, (diagnostics) => {
          clearTimeout(timer)
          waiting.delete(uri)
          resolve(diagnostics)
        })
      })
    },

    async stop() {
      try {
        await connection.sendRequest('shutdown')
        connection.sendNotification('exit')
      } catch {
        // A server that already died has nothing to say about shutting down.
      }
      connection.dispose()
      child.kill()
    },
  }
}

/** Some servers answer `definition` with a `LocationLink` instead. */
function normalizeLocation(one: Location | Record<string, unknown>): Location {
  const link = one as { targetUri?: string; targetSelectionRange?: Range; targetRange?: Range }
  if (link.targetUri) {
    return { uri: link.targetUri, range: link.targetSelectionRange ?? link.targetRange! }
  }
  return one as Location
}

/** Hover comes back as a string, a marked-up string, or an array of either. */
export function hoverText(contents: unknown): string {
  if (contents == null) return ''
  if (typeof contents === 'string') return contents.trim()
  if (Array.isArray(contents)) return contents.map(hoverText).filter(Boolean).join('\n').trim()

  const record = contents as { value?: unknown }
  return typeof record.value === 'string' ? record.value.trim() : ''
}
