import type { ModelSummary } from '../../shared/protocol'
import { REASONING_ORDER, type ReasoningLevel } from '../../shared/vocabulary'

/** The parts of pi's `Model` this app reads. Structural on purpose: pi's own
 *  type is generic over its API union, and none of that reaches the UI. */
export interface PiModelLike {
  id: string
  name: string
  provider: string
  reasoning: boolean
  contextWindow: number
  cost?: { input?: number }
  thinkingLevelMap?: Partial<Record<string, string | null>>
}

/** Which reasoning levels a model can actually do.
 *
 *  pi marks an unsupported level with `null` in the map, and omits levels that
 *  take the provider default. A model that cannot reason at all reports none,
 *  and the selector then skips its second step rather than offering tiles that
 *  would do nothing. */
export function reasoningLevelsOf(model: PiModelLike): ReasoningLevel[] {
  if (!model.reasoning) return []

  const map = model.thinkingLevelMap
  if (!map) return [...REASONING_ORDER]

  return REASONING_ORDER.filter((level) => map[level] !== null)
}

export function toModelSummary(model: PiModelLike): ModelSummary {
  return {
    id: model.id,
    provider: model.provider,
    name: model.name,
    contextWindow: model.contextWindow,
    costPerMTok: model.cost?.input ?? 0,
    reasoning: reasoningLevelsOf(model),
  }
}

/** Sorted so the list reads the same way every time: provider, then name. */
export function summarizeModels(models: readonly PiModelLike[]): ModelSummary[] {
  return models
    .map(toModelSummary)
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
}

/** The nearest level a model supports, for when the requested one is not on its
 *  list. Steps down rather than up: quietly making a turn think harder than
 *  asked would cost the user money they did not agree to. */
export function nearestReasoning(
  requested: ReasoningLevel,
  supported: readonly ReasoningLevel[],
): ReasoningLevel | undefined {
  if (supported.length === 0) return undefined
  if (supported.includes(requested)) return requested

  const wanted = REASONING_ORDER.indexOf(requested)
  const below = supported.filter((level) => REASONING_ORDER.indexOf(level) < wanted)
  if (below.length > 0) return below[below.length - 1]

  return supported[0]
}
