import type { ModelSummary } from '../../../../shared/protocol'
import { session } from '../session'

/** The models pi has configured.
 *
 *  Loaded once and cached: the list comes from pi's own config files, which do
 *  not change while the app runs, and re-reading it every time the selector
 *  opens would put a wait in front of a keystroke. */
class ModelsState {
  all = $state.raw<ModelSummary[]>([])
  error = $state.raw<string | null>(null)
  #loading: Promise<void> | null = null

  load(): Promise<void> {
    this.#loading ??= this.#fetch()
    return this.#loading
  }

  /** Forgets the cache, so a config change can be picked up without a relaunch. */
  refresh(): Promise<void> {
    this.#loading = null
    return this.load()
  }

  async #fetch(): Promise<void> {
    try {
      const { models } = await session.invoke('listModels', {})
      this.all = models
      this.error = null
    } catch (cause) {
      this.all = []
      this.error = cause instanceof Error ? cause.message : String(cause)
    }
  }
}

export const models = new ModelsState()
