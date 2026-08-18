import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import { PiTranslator, lspMeta, toolDetail, toolKind, toolTarget } from './pi-translate'

/** pi's event shapes, fabricated — see the note in `pi-translate.test.ts`. */
const pi = (event: unknown): AgentSessionEvent => event as AgentSessionEvent

describe('a fetched page', () => {
  const fetched = (details: unknown, text: string) => {
    const translator = new PiTranslator()
    return translator.translate(
      pi({
        type: 'tool_execution_end',
        toolCallId: 'f1',
        toolName: 'fetch',
        result: { content: [{ type: 'text', text }], details },
        isError: false,
      }),
    )
  }

  it('draws the page as markdown, without repeating the status line', () => {
    const events = fetched(
      { status: 200, bytes: 12_600 },
      '200 text/html · 12.3KB · https://x.test/d\n\n# Title\n\nbody',
    )
    const body = events.find((event) => event.kind === 'tool-body')

    expect(body?.kind === 'tool-body' && body.body).toEqual({
      type: 'markdown',
      text: '# Title\n\nbody',
    })
  })

  it('says the status and the size in the row', () => {
    const end = fetched({ status: 200, bytes: 12_600 }, 'x\n\ny').find(
      (event) => event.kind === 'tool-end',
    )
    expect(end?.kind === 'tool-end' && end.meta).toBe('200 · 12.3KB')
  })

  it('marks a truncated page as one', () => {
    const end = fetched({ status: 200, bytes: 102_400, truncated: true }, 'x\n\ny').find(
      (event) => event.kind === 'tool-end',
    )
    expect(end?.kind === 'tool-end' && end.meta).toContain('truncated')
  })

  it('says failed when the request never landed', () => {
    const end = fetched({ error: 'no response within 30s' }, 'fetch failed — x').find(
      (event) => event.kind === 'tool-end',
    )
    expect(end?.kind === 'tool-end' && end.meta).toBe('failed')
  })
})

describe('a fetch row', () => {
  it('drops the scheme and assumes GET', () => {
    expect(toolTarget('fetch', { url: 'https://example.com/docs' })).toBe('example.com/docs')
  })

  it('names a method that is not GET, because that one changes something', () => {
    expect(toolTarget('fetch', { url: 'https://api.test/x', method: 'post' })).toBe(
      'POST api.test/x',
    )
  })
})

describe('a language-server row', () => {
  it('leads with its subject, not with a verb phrase', () => {
    // `lsp · draw · references · 6 refs · 3 files` — the two words a reader
    // scans are the first two, at full strength.
    expect(toolTarget('lsp_references', { path: 'src/Ledger.svelte', symbol: 'draw' })).toBe('draw')
    expect(toolDetail('lsp_references')).toBe('references')
  })

  it('falls back to the file when the tool takes no symbol', () => {
    expect(toolTarget('lsp_symbols', { path: 'src/sync/worker.ts' })).toBe('worker.ts')
    expect(toolDetail('lsp_symbols')).toBe('outline')
  })

  it('tells the six of them apart by their operation', () => {
    const operations = [
      'lsp_symbols',
      'lsp_diagnostics',
      'lsp_definition',
      'lsp_references',
      'lsp_hover',
      'lsp_rename_preview',
    ].map((name) => toolDetail(name))

    expect(new Set(operations).size).toBe(6)
  })

  it('names no operation for a tool that is not one of them', () => {
    expect(toolDetail('grep')).toBeUndefined()
  })

  it('draws as its own row, never as a grep', () => {
    // `grepped outline src/app.ts` claimed the one thing these tools replace.
    expect(toolKind('lsp_references')).toBe('lsp')
  })

  it('takes its meta from what the tool counted, never from the prose', () => {
    const result = { details: { summary: '6 refs · 3 files' } }
    expect(lspMeta('lsp_references', result)).toBe('6 refs · 3 files')
    expect(lspMeta('grep', result)).toBeUndefined()
    expect(lspMeta('lsp_references', { details: undefined })).toBeUndefined()
  })
})
