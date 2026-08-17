/** Starting a language server process and completing its handshake.
 *
 *  Separated from the request surface because it is where every way a server
 *  can fail to exist lives — a missing binary, a process that dies at once, one
 *  that never answers `initialize` — and none of that is about what the tools
 *  later ask it. Everything here is finite: no path leaves a caller waiting
 *  forever, and no failure escapes as an event nobody is listening for. */

import { spawn, type ChildProcess } from 'node:child_process'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import type { LspServerSpec } from '../../shared/lsp'
import type { Diagnostic } from './client'

/** How long a server gets to finish starting. Generous — a type-checker
 *  indexing a large repository is slow — but finite. */
const START_MS = 30_000

export interface StartOptions {
  /** Injected in tests so a fake server can be driven without a binary. */
  spawnProcess?: typeof spawn
}

/** What a server sends back for `initialize`. Only the shape we act on. */
interface InitializeResult {
  capabilities?: Record<string, unknown>
}

export interface Connected {
  child: ChildProcess
  connection: MessageConnection
  /** Diagnostics the server has published, newest per file. */
  published: Map<string, Diagnostic[]>
  /** Calls waiting on the next publish for a file. A list, because several can
   *  be waiting at once. */
  waiting: Map<string, ((diagnostics: Diagnostic[]) => void)[]>
}

const uriOf = (path: string): string => new URL(`file://${encodeURI(path)}`).toString()

export async function connect(
  spec: LspServerSpec,
  root: string,
  options: StartOptions = {},
): Promise<Connected> {
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

  return { child, connection, published, waiting }
}
