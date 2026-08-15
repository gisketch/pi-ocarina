import { describe, expect, it } from 'vitest'
import { nearestReasoning, reasoningLevelsOf, summarizeModels, type PiModelLike } from './models'

function model(overrides: Partial<PiModelLike> = {}): PiModelLike {
  return {
    id: 'gpt-5.4-mini',
    name: 'GPT 5.4 mini',
    provider: 'openai-codex',
    reasoning: true,
    contextWindow: 200_000,
    cost: { input: 3 },
    ...overrides,
  }
}

describe('reasoningLevelsOf', () => {
  it('reports none for a model that cannot reason', () => {
    expect(reasoningLevelsOf(model({ reasoning: false }))).toEqual([])
  })

  it('reports every level when the model names no limits', () => {
    expect(reasoningLevelsOf(model())).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
  })

  it('drops the levels pi marks unsupported', () => {
    const levels = reasoningLevelsOf(
      model({ thinkingLevelMap: { minimal: null, xhigh: null, max: null } }),
    )

    expect(levels).toEqual(['off', 'low', 'medium', 'high'])
  })

  it('keeps a level whose value is a provider string', () => {
    expect(reasoningLevelsOf(model({ thinkingLevelMap: { high: 'deep' } }))).toContain('high')
  })
})

describe('summarizeModels', () => {
  it('carries what the row draws', () => {
    const [summary] = summarizeModels([model()])

    expect(summary).toMatchObject({
      id: 'gpt-5.4-mini',
      provider: 'openai-codex',
      name: 'GPT 5.4 mini',
      contextWindow: 200_000,
      costPerMTok: 3,
    })
  })

  it('reports zero cost rather than nothing when pi gives no price', () => {
    expect(summarizeModels([model({ cost: undefined })])[0].costPerMTok).toBe(0)
  })

  it('sorts by provider then name, so the list never reshuffles', () => {
    const models = [
      model({ provider: 'z-provider', name: 'A model' }),
      model({ provider: 'a-provider', name: 'Z model' }),
      model({ provider: 'a-provider', name: 'B model' }),
    ]

    expect(summarizeModels(models).map((m) => `${m.provider}/${m.name}`)).toEqual([
      'a-provider/B model',
      'a-provider/Z model',
      'z-provider/A model',
    ])
  })
})

describe('nearestReasoning', () => {
  const supported = ['off', 'low', 'high'] as const

  it('keeps a level the model supports', () => {
    expect(nearestReasoning('high', supported)).toBe('high')
  })

  it('steps down to the next level the model has', () => {
    // Never up: quietly making a turn think harder than asked would cost the
    // user money they did not agree to.
    expect(nearestReasoning('max', supported)).toBe('high')
    expect(nearestReasoning('medium', supported)).toBe('low')
  })

  it('takes the weakest level when there is nothing below', () => {
    expect(nearestReasoning('off', ['low', 'high'])).toBe('low')
  })

  it('returns nothing for a model that cannot reason', () => {
    expect(nearestReasoning('high', [])).toBeUndefined()
  })
})
