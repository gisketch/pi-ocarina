import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { EmitEvent, ModelSummary, UiEvent } from '../../shared/protocol'
import type { ReasoningLevel } from '../../shared/vocabulary'
import { nearestReasoning, summarizeModels, type PiModelLike } from './models'
import type { SessionFactory } from './session-factory'

/** Which model a thread runs on, and how hard it thinks.
 *
 *  pi owns both: `setModel` and `setThinkingLevel` write the choice into the
 *  session file, so it survives a relaunch without this app keeping a second
 *  copy that could disagree. Nothing here is stored. */
export class ModelControl {
  readonly #sessions: SessionFactory

  constructor(sessions: SessionFactory) {
    this.#sessions = sessions
  }

  async list(): Promise<ModelSummary[]> {
    return summarizeModels(await this.#sessions.models())
  }

  async set(session: AgentSession, provider: string, modelId: string): Promise<void> {
    const model = (await this.#sessions.models()).find(
      (candidate) => candidate.provider === provider && candidate.id === modelId,
    )
    if (!model) throw new Error(`pi has no model "${provider}/${modelId}" available`)

    await session.setModel(model)
  }

  /** pi clamps the level to what the model supports, but silently. Choosing the
   *  nearest supported level here means the UI can say which one it landed on,
   *  and stepping down rather than up means a clamp never costs more money than
   *  the user asked to spend. */
  /** Either setter, chosen by command name.
   *
   *  One entry point because the driver does the same three things after both —
   *  apply, announce from the session, report ok — and two cases that differ
   *  only in one call were two places for that to drift. */
  async apply(session: AgentSession, name: string, params: unknown): Promise<void> {
    if (name === 'setReasoning') {
      const { reasoning } = params as { reasoning: ReasoningLevel }
      this.setReasoning(session, reasoning)
      return
    }

    const { provider, model } = params as { provider: string; model: string }
    await this.set(session, provider, model)
  }

  setReasoning(session: AgentSession, reasoning: ReasoningLevel): void {
    const model = session.model as PiModelLike | undefined
    if (!model) return

    const level = nearestReasoning(reasoning, summarizeModels([model])[0].reasoning)
    if (!level) return

    session.setThinkingLevel(level as never)
  }

  /** Tells the UI what a thread is running on. Silent before pi has chosen —
   *  a thread with no model yet has nothing true to report. */
  announce(threadId: string, session: AgentSession | undefined, emit: EmitEvent): void {
    const event = ModelControl.describe(session)
    if (event) emit(threadId, event)
  }

  /** What a thread is running on, as an event. Null before pi has chosen. */
  static describe(session: AgentSession | undefined): UiEvent | null {
    const model = session?.model as PiModelLike | undefined
    if (!session || !model) return null

    return {
      kind: 'model',
      provider: model.provider,
      id: model.id,
      name: model.name,
      reasoning: session.thinkingLevel as ReasoningLevel,
    }
  }
}
