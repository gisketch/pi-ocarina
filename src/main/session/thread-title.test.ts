import { describe, expect, it } from 'vitest'
import type { PiModelLike } from './models'
import type { Thread } from './thread-registry'
import { pickTitleModel, sanitizeTitle, wantsTitle } from './thread-title'

describe('sanitizing what the model said', () => {
  it('keeps a plain title as it is', () => {
    expect(sanitizeTitle('Fix the follow pin')).toBe('Fix the follow pin')
  })

  it('takes the first non-empty line of a chatty answer', () => {
    expect(sanitizeTitle('\n\nChip field rewrite\n\nHere is why…')).toBe('Chip field rewrite')
  })

  it('undresses quotes, a Title: prefix, and a trailing period', () => {
    expect(sanitizeTitle('"Compaction divider redo."')).toBe('Compaction divider redo')
    expect(sanitizeTitle('Title: Rename dialog')).toBe('Rename dialog')
    expect(sanitizeTitle('`smooth scroll fix`')).toBe('smooth scroll fix')
  })

  it('collapses runs of whitespace to one space', () => {
    expect(sanitizeTitle('two   words\t here')).toBe('two words here')
  })

  it('caps a runaway line and says so with an ellipsis', () => {
    const long = sanitizeTitle('x'.repeat(200))
    expect(long?.length).toBeLessThanOrEqual(80)
    expect(long?.endsWith('…')).toBe(true)
  })

  it('gives null for nothing worth writing', () => {
    expect(sanitizeTitle('')).toBeNull()
    expect(sanitizeTitle('  \n  ')).toBeNull()
    expect(sanitizeTitle('""')).toBeNull()
  })
})

const model = (provider: string, id: string, name: string, input?: number): PiModelLike => ({
  id,
  name,
  provider,
  reasoning: false,
  contextWindow: 100_000,
  ...(input === undefined ? {} : { cost: { input } }),
})

describe('picking the titling model', () => {
  const CATALOG = [
    model('anthropic', 'claude-sonnet-5', 'Sonnet 5', 3),
    model('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', 1.2),
    model('anthropic', 'claude-haiku-4-5', 'Haiku 4.5', 0.8),
  ]

  it('lets the reader name one, verbatim', () => {
    expect(pickTitleModel(CATALOG, 'anthropic/claude-haiku-4-5')).toBe(
      'anthropic/claude-haiku-4-5',
    )
  })

  it('prefers Luna when this machine has it', () => {
    expect(pickTitleModel(CATALOG)).toBe('openai/gpt-5.6-luna')
  })

  it('falls back to the cheapest without Luna', () => {
    const noLuna = CATALOG.filter((one) => one.id !== 'gpt-5.6-luna')
    expect(pickTitleModel(noLuna)).toBe('anthropic/claude-haiku-4-5')
  })

  it('never picks an unpriced model while a priced one exists', () => {
    // A $0 entry is usually local or half-configured, and "cheapest" picking a
    // model that cannot answer is a titler that silently never works.
    const withFree = [model('local', 'llama', 'Llama', 0), model('anthropic', 'claude-haiku-4-5', 'Haiku 4.5', 0.8)]
    expect(pickTitleModel(withFree)).toBe('anthropic/claude-haiku-4-5')
  })

  it('takes what there is when nothing carries a price', () => {
    expect(pickTitleModel([model('local', 'llama', 'Llama', 0)])).toBe('local/llama')
  })

  it('gives undefined with nothing to pick from, so pi decides', () => {
    expect(pickTitleModel([])).toBeUndefined()
  })
})

const thread = (prompts: number, name?: string): Thread =>
  ({
    prompts,
    session: { sessionManager: { getSessionName: () => name } },
  }) as unknown as Thread

describe('when the titler runs', () => {
  it('runs on the first prompt of a nameless session', () => {
    expect(wantsTitle(thread(1))).toBe(true)
  })

  it('never runs on a session somebody has named', () => {
    expect(wantsTitle(thread(1, 'my thread'))).toBe(false)
  })

  it('never runs past the first prompt', () => {
    expect(wantsTitle(thread(2))).toBe(false)
  })
})
