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

/** How long a server gets to finish starting. Generous — a type-checker
 *  indexing a large repository is slow — but finite. */
const START_MS = 30_000

/** How long a server gets to shut down politely before it is killed. */
const STOP_MS = 2_000

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

  /** A failed exec is reported asynchronously, on the process object.
   *
   *  Without a listener that is an unhandled 'error' event, which Electron's
   *  default handler turns into a modal alert blocking the whole app — and it
   *  fires again on every attempt. A missing binary is the ordinary case here,
   *  not an exceptional one: the settings screen offers servers the reader has
   *  not installed yet.
   *
   *  Nothing is written to the process until it has actually started. With
   *  ENOENT the pipes exist but are already destroyed, so building the
   *  connection first meant the JSON-RPC writer failed inside the library, as
   *  a rejection no caller could reach. */
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', (cause: NodeJS.ErrnoException) => {
      reject(
        cause.code === 'ENOENT'
          ? new Error(`${spec.command} is not installed — install it, or switch this server off`)
          : cause,
      )
    })
  })

  /** The process going away after it started. Every request in flight fails
   *  with it, and `initialize` has to stop waiting. */
  const died = new Promise<never>((_, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      reject(new Error(`${spec.command} exited (${code ?? 'signal'}) before it was ready`))
    })
  })
  // Nothing else awaits it, and an unobserved rejection is its own crash.
  died.catch(() => {})
  // Drained rather than inherited: a server that logs heavily would otherwise
  // fill the app's own output with noise nobody asked for.
  child.stderr?.resume()

  const connection: MessageConnection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  )

  const published = new Map<string, Diagnostic[]>()
  /** Several calls can be waiting on the same file at once, so this is a list
   *  per uri rather than one callback — a Map of single callbacks silently
   *  dropped whichever call registered first, and its timeout then deleted the
   *  other call's waiter on the way out. */
  const waiting = new Map<string, ((diagnostics: Diagnostic[]) => void)[]>()

  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string; diagnostics: Diagnostic[] }) => {
      published.set(params.uri, params.diagnostics ?? [])
      const listeners = waiting.get(params.uri)
      waiting.delete(params.uri)
      for (const listener of listeners ?? []) listener(params.diagnostics ?? [])
    },
  )
  // Servers ask questions of their own. Answering nothing is fine; failing to
  // answer at all leaves some of them waiting forever.
  connection.onRequest('workspace/configuration', () => [null])
  connection.onRequest('client/registerCapability', () => null)
  connection.onRequest('window/workDoneProgress/create', () => null)
  // A connection whose process has gone reports it here. Unhandled, these
  // surface as uncaught errors from inside the library rather than as a failed
  // call — the failure is already carried by whichever request was in flight.
  connection.onError(() => {})
  connection.onClose(() => {})
  connection.listen()

  const ready = connection.sendRequest<InitializeResult>('initialize', {
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

  // Observed even when the race settles on something else. When the process
  // died, `initialize` rejects too — a write to a destroyed pipe — and a
  // rejection nobody is listening to is its own crash.
  ready.catch(() => {})

  /** A server that never answers must not wedge its language forever. The pool
   *  caches the promise this returns, so one that never settles is permanent
   *  until the app restarts. */
  const tooSlow = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${spec.command} did not answer initialize within ${START_MS / 1000}s`)),
      START_MS,
    )
    timer.unref?.()
    void ready.finally(() => clearTimeout(timer))
  })
  tooSlow.catch(() => {})

  try {
    await Promise.race([ready, died, tooSlow])
  } catch (cause) {
    connection.dispose()
    child.kill()
    throw cause
  }
  connection.sendNotification('initialized', {})

  /** Documents the server has been handed, newest last. */
  const open: string[] = []

  /** Version numbers per open document, so a resync is a change and not a
   *  second open. */
  const versions = new Map<string, number>()

  /** Hands the server the file, or the file *again* when it has changed.
   *
   *  Resyncing is the whole of why an edit's diagnostics are worth anything.
   *  The agent edits on disk; the server is still holding the copy it was given
   *  at `didOpen`, so without a `didChange` every diagnostic after the first
   *  describes the file as it was before the edit — reporting errors that are
   *  fixed and staying silent about the one just introduced. */
  const ensureOpen = async (path: string, resync = false): Promise<string> => {
    const uri = uriOf(path)

    if (open.includes(uri)) {
      if (!resync) return uri
      const text = await readFile(path, 'utf8')
      const version = (versions.get(uri) ?? 1) + 1
      versions.set(uri, version)
      connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      })
      // The server answers a change with a fresh publish; the cached one is
      // about a file that no longer exists in that form.
      published.delete(uri)
      return uri
    }

    const text = await readFile(path, 'utf8')
    connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: spec.id, version: 1, text },
    })
    versions.set(uri, 1)
    open.push(uri)

    while (open.length > MAX_OPEN) {
      const oldest = open.shift()
      if (oldest) {
        versions.delete(oldest)
        published.delete(oldest)
        connection.sendNotification('textDocument/didClose', { textDocument: { uri: oldest } })
      }
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
      // Always resynced: this is asked right after an edit, and the answer is
      // worthless if it describes the file as it was before.
      const uri = await ensureOpen(path, true)
      const already = published.get(uri)
      if (already) return already

      // Diagnostics arrive as a notification whenever the server is ready, so
      // the only honest way to ask for them is to wait a bounded moment.
      return new Promise<Diagnostic[]>((resolve) => {
        const settle = (diagnostics: Diagnostic[]): void => {
          clearTimeout(timer)
          resolve(diagnostics)
        }
        const timer = setTimeout(() => {
          const listeners = waiting.get(uri)?.filter((one) => one !== settle) ?? []
          if (listeners.length > 0) waiting.set(uri, listeners)
          else waiting.delete(uri)
          resolve(published.get(uri) ?? [])
        }, DIAGNOSTIC_WAIT_MS)

        waiting.set(uri, [...(waiting.get(uri) ?? []), settle])
      })
    },

    async stop() {
      try {
        // Raced, not simply awaited: a wedged server would otherwise never be
        // killed, and `stopAll` — which quitting the app waits on — would hang
        // with it.
        await Promise.race([
          connection.sendRequest('shutdown'),
          new Promise((resolve) => {
            const timer = setTimeout(resolve, STOP_MS)
            timer.unref?.()
          }),
        ])
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
