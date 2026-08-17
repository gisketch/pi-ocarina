import { describe, expect, it, vi } from 'vitest'
import type { LspServerSpec } from '../../shared/lsp'
import type { Diagnostic, LspClient, Location, Symbol } from './client'
import { describeAmbiguous, describeMissing, flatten, locate } from './locate'
import { LspPool } from './pool'
import { describeDiagnostics, injectionFor, insideWorkspace, listLocations } from './report'
import { lspTools } from './tools'

const CWD = '/w'

const range = (line: number, from = 0, to = 4) => ({
  start: { line, character: from },
  end: { line, character: to },
})

const SYMBOLS: Symbol[] = [
  {
    name: 'Ledger',
    kind: 5,
    range: range(0),
    selectionRange: range(0, 6, 12),
    children: [{ name: 'draw', kind: 6, range: range(3), selectionRange: range(3, 2, 6) }],
  },
  { name: 'total', kind: 12, range: range(15), selectionRange: range(15, 9, 14) },
  { name: 'draw', kind: 12, range: range(30), selectionRange: range(30, 9, 13) },
]

function stub(over: Partial<LspClient> = {}): LspClient {
  return {
    id: 'typescript',
    documentSymbols: async () => SYMBOLS,
    definition: async () => [],
    references: async () => [],
    hover: async () => '',
    rename: async () => [],
    diagnostics: async () => [],
    stop: async () => {},
    ...over,
  }
}

const SPEC: LspServerSpec = {
  id: 'typescript',
  label: 'TS',
  extensions: ['.ts'],
  command: 'ts-ls',
  args: [],
  rootFiles: [],
  install: '',
}

function tools(client: LspClient = stub()) {
  const pool = new LspPool(CWD, { servers: [SPEC], start: async () => client })
  const list = lspTools({ pool, cwd: CWD, settings: () => ({ on: true }) })
  const call = async (name: string, params: unknown): Promise<string> => {
    const tool = list.find((one) => one.name === name)!
    const result = await tool.execute('t1', params as never)
    return result.content[0].text
  }
  return { call, list }
}

describe('locate', () => {
  it('finds a name that means one thing', () => {
    const found = locate(SYMBOLS, 'total')
    expect('at' in found && found.at.line).toBe(16)
  })

  it('reaches a symbol nested inside another', () => {
    // A method is not top-level, and a model asking for `draw` should not have
    // to know that.
    expect(flatten(SYMBOLS).map((one) => one.name)).toEqual(['Ledger', 'draw', 'total', 'draw'])
  })

  it('refuses to guess between two things with the same name', () => {
    // Picking one silently makes the answer wrong in a way nobody can see.
    const found = locate(SYMBOLS, 'draw')
    expect('ambiguous' in found && found.ambiguous).toHaveLength(2)
  })

  it('accepts the ways a model writes a name', () => {
    expect('at' in locate(SYMBOLS, 'total()')).toBe(true)
    expect('at' in locate(SYMBOLS, 'Ledger.total')).toBe(true)
  })

  it('says what the file does have when the name is not there', () => {
    const found = locate(SYMBOLS, 'nope')
    expect('missing' in found).toBe(true)
    if (!('missing' in found)) return
    expect(describeMissing('nope', found.available)).toContain('total')
  })

  it('names the lines to choose between when a name is ambiguous', () => {
    const said = describeAmbiguous('draw', flatten(SYMBOLS).filter((one) => one.name === 'draw'))
    expect(said).toContain('line 4')
    expect(said).toContain('line 31')
  })
})

describe('report', () => {
  const at = (path: string, line: number): Location => ({
    uri: `file://${path}`,
    range: range(line),
  })

  it('writes a location the way the next call would', () => {
    expect(listLocations([at('/w/src/a.ts', 4)], CWD, 'references')).toContain('src/a.ts:5')
  })

  it('drops what is outside the workspace and says how much', () => {
    // A path in a global toolchain is a real answer and an unopenable one.
    const said = listLocations([at('/w/a.ts', 0), at('/usr/lib/node/x.d.ts', 2)], CWD, 'references')

    expect(said).toContain('a.ts:1')
    expect(said).not.toContain('/usr/lib')
    expect(said).toContain('1 outside this workspace')
  })

  it('says plainly when everything found was outside', () => {
    const said = listLocations([at('/usr/lib/x.d.ts', 2)], CWD, 'references')
    expect(said).toContain('no references in this workspace')
  })

  it('refuses a path that climbs out of the workspace', () => {
    expect(insideWorkspace('file:///etc/passwd', CWD)).toBeNull()
    expect(insideWorkspace('file:///w/src/a.ts', CWD)).toBe('src/a.ts')
  })

  it('flattens a multi-line compiler message onto one row', () => {
    const diagnostics: Diagnostic[] = [
      { range: range(2), severity: 1, message: 'Type A\n  is not\n  assignable' },
    ]
    expect(describeDiagnostics(diagnostics, 'a.ts')).toBe(
      'a.ts:3 error: Type A is not assignable',
    )
  })

  it('says a clean file is clean', () => {
    expect(describeDiagnostics([], 'a.ts')).toContain('no problems')
  })
})

describe('what rides back on an edit', () => {
  const error = (line: number, message: string): Diagnostic => ({
    range: range(line),
    severity: 1,
    message,
  })

  it('says nothing at all when the file compiles', () => {
    // This runs on every write, so silence has to be free.
    expect(injectionFor([], 'a.ts')).toBe('')
  })

  it('ignores warnings, and reports errors', () => {
    const mixed: Diagnostic[] = [error(1, 'broken'), { range: range(4), severity: 2, message: 'meh' }]
    const said = injectionFor(mixed, 'a.ts')

    expect(said).toContain('a.ts:2 broken')
    expect(said).not.toContain('meh')
    expect(said).toContain('1 error')
  })

  it('caps a file that is entirely broken', () => {
    const many = Array.from({ length: 30 }, (_, i) => error(i, `e${i}`))
    const said = injectionFor(many, 'a.ts')

    expect(said.split('\n').filter((line) => line.includes('a.ts:'))).toHaveLength(10)
    expect(said).toContain('20 more')
  })
})

describe('the tools', () => {
  it('offers exactly the six', () => {
    expect(tools().list.map((one) => one.name)).toEqual([
      'lsp_symbols',
      'lsp_diagnostics',
      'lsp_definition',
      'lsp_references',
      'lsp_hover',
      'lsp_rename_preview',
    ])
  })

  it('tells the model that symbols go to the server, not to grep', () => {
    const guidelines = tools().list[0].promptGuidelines.join(' ')
    expect(guidelines).toContain('Do not grep for a symbol')
  })

  it('outlines a file', async () => {
    const { call } = tools()
    expect(await call('lsp_symbols', { path: 'a.ts' })).toBe(
      'a.ts:1 class Ledger\na.ts:4 method draw\na.ts:16 function total\na.ts:31 function draw',
    )
  })

  it('finds references from the symbol name alone', async () => {
    const references = vi.fn().mockResolvedValue([{ uri: 'file:///w/b.ts', range: range(9) }])
    const { call } = tools(stub({ references }))

    const said = await call('lsp_references', { path: 'a.ts', symbol: 'total' })

    // Resolved to the symbol's real position — the model never gave a column.
    expect(references).toHaveBeenCalledWith('/w/a.ts', { line: 15, character: 9 })
    expect(said).toContain('b.ts:10')
  })

  it('answers an ambiguous name with the choice, not a guess', async () => {
    const { call } = tools()
    expect(await call('lsp_references', { path: 'a.ts', symbol: 'draw' })).toContain(
      'is several things',
    )
  })

  it('previews a rename and changes nothing', async () => {
    const rename = vi.fn().mockResolvedValue([{ uri: 'file:///w/a.ts', range: range(15) }])
    const { call } = tools(stub({ rename }))

    const said = await call('lsp_rename_preview', {
      path: 'a.ts',
      symbol: 'total',
      newName: 'sum',
    })

    expect(said).toContain('would change 1 place')
    expect(said).toContain('Nothing has changed yet')
  })

  it('refuses a path that climbs out of the workspace', async () => {
    // A path is untrusted input even when a model wrote it, and these tools
    // open files.
    const { call } = tools()
    expect(await call('lsp_symbols', { path: '../../etc/passwd' })).toContain(
      'outside this workspace',
    )
  })

  it('sends the model back to grep when no server covers the file', async () => {
    const { call } = tools()
    const said = await call('lsp_symbols', { path: 'notes.md' })

    expect(said).toContain('no language server')
    expect(said).toContain('grep')
  })

  it('sends the model back to grep when the server breaks', async () => {
    const { call } = tools(
      stub({
        documentSymbols: async () => {
          throw new Error('write EPIPE')
        },
      }),
    )

    expect(await call('lsp_symbols', { path: 'a.ts' })).toContain('grep')
  })
})
