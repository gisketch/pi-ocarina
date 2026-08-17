import { describe, expect, it } from 'vitest'
import type { LspServerSpec } from '../../shared/lsp'
import type { Diagnostic, LspClient } from '../lsp/client'
import { LspPool } from '../lsp/pool'
import {
  appendNote,
  demote,
  FALLBACK_NOTE,
  injectDiagnostics,
  promptLine,
  type ResultEvent,
} from './lsp-extension'

const SPEC: LspServerSpec = {
  id: 'typescript',
  label: 'TS',
  extensions: ['.ts'],
  command: 'ts-ls',
  args: [],
  rootFiles: [],
  install: '',
}

const error = (line: number, message: string): Diagnostic => ({
  range: { start: { line, character: 0 }, end: { line, character: 4 } },
  severity: 1,
  message,
})

function client(over: Partial<LspClient> = {}): LspClient {
  return {
    id: 'typescript',
    documentSymbols: async () => [],
    definition: async () => [],
    references: async () => [],
    hover: async () => '',
    rename: async () => [],
    diagnostics: async () => [],
    stop: async () => {},
    ...over,
  }
}

function deps(over: Partial<LspClient> = {}) {
  const pool = new LspPool('/w', { servers: [SPEC], start: async () => client(over) })
  return { pool, cwd: '/w', settings: () => ({ on: true }) }
}

const edit = (over: Partial<ResultEvent> = {}): ResultEvent => ({
  toolName: 'edit',
  input: { path: 'src/a.ts' },
  content: [{ type: 'text', text: 'edited src/a.ts' }],
  isError: false,
  ...over,
})

describe('demoting the search tools', () => {
  it('puts the note in front and keeps what the tool actually does', () => {
    // A description that lied about what grep does would be worse than no
    // demotion at all.
    const said = demote('Search file contents with a regular expression.')

    expect(said.startsWith(FALLBACK_NOTE)).toBe(true)
    expect(said).toContain('Search file contents')
  })

  it('names the tools to reach for instead', () => {
    expect(FALLBACK_NOTE).toContain('lsp_references')
    expect(FALLBACK_NOTE).toContain('strings, comments, configuration')
  })
})

describe('the prompt line', () => {
  it('names the languages this repository actually has', () => {
    const said = promptLine(['TypeScript / JavaScript', 'C#'])

    expect(said).toContain('TypeScript / JavaScript, C#')
    expect(said).toContain('lsp_')
  })

  it('says nothing when nothing is enabled', () => {
    // A workspace without language servers carries no sentence about them.
    expect(promptLine([])).toBe('')
  })
})

describe('diagnostics riding back on an edit', () => {
  it('says nothing when no server is up for the file', async () => {
    // Starting one here would put a type-checker's cold start in the path of a
    // write the user is waiting on, to answer a question nobody asked.
    const shared = deps({ diagnostics: async () => [error(2, 'broken')] })

    expect(await injectDiagnostics(shared, edit())).toBe('')
  })

  it('reports the errors once a server is already running', async () => {
    const shared = deps({ diagnostics: async () => [error(2, 'Cannot find name')] })
    await shared.pool.withClient('/w/src/a.ts', { on: true }, async () => 1)

    const note = await injectDiagnostics(shared, edit())

    expect(note).toContain('src/a.ts:3 Cannot find name')
    expect(note).toContain('1 error')
  })

  it('ignores a call that changed nothing', async () => {
    const shared = deps({ diagnostics: async () => [error(0, 'broken')] })
    await shared.pool.withClient('/w/src/a.ts', { on: true }, async () => 1)

    expect(await injectDiagnostics(shared, edit({ toolName: 'read' }))).toBe('')
    expect(await injectDiagnostics(shared, edit({ toolName: 'grep' }))).toBe('')
  })

  it('ignores an edit that already failed', async () => {
    const shared = deps({ diagnostics: async () => [error(0, 'broken')] })
    await shared.pool.withClient('/w/src/a.ts', { on: true }, async () => 1)

    expect(await injectDiagnostics(shared, edit({ isError: true }))).toBe('')
  })

  it('reads the path under either name pi uses', async () => {
    const shared = deps({ diagnostics: async () => [error(0, 'broken')] })
    await shared.pool.withClient('/w/src/a.ts', { on: true }, async () => 1)

    const note = await injectDiagnostics(
      shared,
      edit({ input: { file_path: '/w/src/a.ts' } }),
    )
    expect(note).toContain('broken')
  })

  it('never fails the edit when the server fails', async () => {
    // The write already happened. A reporting failure must not look like one.
    const shared = deps({
      diagnostics: async () => {
        throw new Error('write EPIPE')
      },
    })
    await shared.pool.withClient('/w/src/a.ts', { on: true }, async () => 1)

    expect(await injectDiagnostics(shared, edit())).toBe('')
  })
})

describe('appending to a result', () => {
  it('adds to the last text block, so the model reads one message', () => {
    const event = edit()
    appendNote(event, '\n\nbroken')

    expect(event.content).toHaveLength(1)
    expect(event.content[0].text).toBe('edited src/a.ts\n\nbroken')
  })

  it('adds a block when the result had no text at all', () => {
    const event = edit({ content: [{ type: 'image' }] })
    appendNote(event, '\n\nbroken')

    expect(event.content).toHaveLength(2)
    expect(event.content[1]).toEqual({ type: 'text', text: 'broken' })
  })

  it('leaves a clean result untouched', () => {
    const event = edit()
    appendNote(event, '')

    expect(event.content[0].text).toBe('edited src/a.ts')
  })
})
