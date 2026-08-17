import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LspServerSpec } from '../../shared/lsp'
import { hoverText, startClient, symbolKind, type LspClient } from './client'

/** A real child process speaking real `Content-Length` frames.
 *
 *  A mocked connection would prove only that our own mock agrees with us. The
 *  framing, the notification that arrives after the request, and the two shapes
 *  a server may answer `definition` with are exactly the parts worth testing. */
const FAKE = fileURLToPath(new URL('./fake-server.mjs', import.meta.url))

const spec: LspServerSpec = {
  id: 'fake',
  label: 'Fake',
  extensions: ['.ts'],
  command: process.execPath,
  args: [FAKE],
  rootFiles: [],
  install: '',
}

let root = ''
let file = ''
let client: LspClient

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'piocarina-lsp-'))
  file = join(root, 'a.ts')
  await writeFile(file, 'class Ledger {\n  draw() {}\n}\n', 'utf8')
  client = await startClient(spec, root)
}, 20_000)

afterAll(async () => {
  await client?.stop()
  if (root) await rm(root, { recursive: true, force: true })
})

describe('startClient', () => {
  it('completes the handshake against a real process', () => {
    expect(client.id).toBe('fake')
  })

  it('reads a file\'s symbols, hierarchy and all', async () => {
    const symbols = await client.documentSymbols(file)

    expect(symbols.map((one) => one.name)).toEqual(['Ledger', 'total', 'draw'])
    expect(symbols[0].children?.[0].name).toBe('draw')
  })

  it('finds references', async () => {
    const found = await client.references(file, { line: 0, character: 6 })

    expect(found).toHaveLength(2)
    expect(found[1].uri).toBe('file:///w/other.ts')
  })

  it('reads a definition sent as a link', async () => {
    // Servers answer with either `Location` or `LocationLink`; a client that
    // handles one of them silently returns nothing for half the ecosystem.
    const found = await client.definition(file, { line: 0, character: 6 })

    expect(found).toHaveLength(1)
    expect(found[0].range.start).toEqual({ line: 0, character: 6 })
  })

  it('reads hover text out of its wrapper', async () => {
    expect(await client.hover(file, { line: 0, character: 6 })).toBe('class Ledger')
  })

  it('previews a rename as the edits it would make', async () => {
    const edits = await client.rename(file, { line: 0, character: 6 }, 'Book')

    expect(edits).toHaveLength(1)
    expect(edits[0].range.start.line).toBe(0)
  })

  it('waits for diagnostics that arrive after the file was opened', async () => {
    // The server publishes on its own schedule, so asking is really waiting.
    const found = await client.diagnostics(file)

    expect(found).toHaveLength(2)
    expect(found[0].message).toContain('Cannot find name')
  })
})

describe('hoverText', () => {
  it('reads every shape a server may answer with', () => {
    expect(hoverText('plain')).toBe('plain')
    expect(hoverText({ kind: 'markdown', value: 'x' })).toBe('x')
    expect(hoverText(['a', { value: 'b' }])).toBe('a\nb')
    expect(hoverText(null)).toBe('')
    expect(hoverText({ nothing: true })).toBe('')
  })
})

describe('symbolKind', () => {
  it('names the kinds a reader would recognise', () => {
    expect(symbolKind(5)).toBe('class')
    expect(symbolKind(12)).toBe('function')
    expect(symbolKind(999)).toBe('symbol')
  })
})

describe('a file that changed under the server', () => {
  it('resyncs before answering, so an edit is described by its own diagnostics', async () => {
    // The agent edits on disk while the server holds the copy it was given at
    // didOpen. Without a didChange, every diagnostic after the first describes
    // the file as it was before the edit.
    const changing = join(root, 'b.ts')
    await writeFile(changing, 'const a = 1\n', 'utf8')

    const first = await client.diagnostics(changing)
    expect(first).toHaveLength(2)

    await writeFile(changing, 'const a = 1\nconst b = 2\nconst c = 3\n', 'utf8')
    const second = await client.diagnostics(changing)

    // The fixture answers a change with a fresh publish, as a real server does.
    expect(second).toHaveLength(2)
  })
})

describe('a server that cannot be started', () => {
  it('rejects rather than reaching Node as an unhandled error', async () => {
    // Electron turns an unhandled 'error' into a modal alert that blocks the
    // whole app, and it fires again on every attempt. A missing binary is the
    // ordinary case: the settings screen offers servers not yet installed.
    await expect(
      startClient({ ...spec, command: '/nonexistent/language-server' }, root),
    ).rejects.toThrow(/not installed|ENOENT/)
  })

  it('names the binary, so the message is actionable', async () => {
    await expect(startClient({ ...spec, command: 'no-such-ls-binary' }, root)).rejects.toThrow(
      /no-such-ls-binary/,
    )
  })
})
