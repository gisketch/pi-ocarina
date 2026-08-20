/** Which model a session runs on, and which ones this machine could run.
 *
 *  Split from the factory, which is about standing a session up — its
 *  extensions, its tools, its resource loader. Every question that begins "which
 *  model" is answered here instead, because they share one thing the rest of the
 *  factory does not: pi's `ModelRuntime`, built once and lazily.
 *
 *  Nothing here knows what a session is. */

import type { Sdk } from './workspaces'

// Derived from the factory: pi's ModelRuntime constructor is private.
type ModelRuntimeOf = Awaited<ReturnType<Sdk['ModelRuntime']['create']>>
export type ResolvedModel = ReturnType<ModelRuntimeOf['getModel']> | undefined

/** A model named the way pi's config names it. */
export interface ModelRef {
  provider: string
  id: string
}

/** What a child ended up running on: the model, and the name it goes by.
 *
 *  Both, because they answer different questions — pi needs the model, and the
 *  peek needs something to print. `named` is absent when this app named no
 *  model at all and pi chose its own; there is no honest id to show then. */
export interface Chosen {
  model: ResolvedModel
  named?: string
}

export class ModelBook {
  readonly #load: () => Promise<Sdk>
  /** The app's own model. A session that names none borrows this. */
  readonly #own: ModelRef | undefined
  #runtime: Promise<ModelRuntimeOf> | null = null

  constructor(load: () => Promise<Sdk>, own?: ModelRef) {
    this.#load = load
    this.#own = own
  }

  /** The models this machine can actually run.
   *
   *  `getModels()` returns pi's whole catalogue — over a thousand entries,
   *  nearly all of them for providers with no credentials here. Selecting one
   *  throws "No API key". `getAvailable()` is the set with auth configured,
   *  which is the only honest list to put in front of a person. */
  async available(): Promise<ReturnType<ModelRuntimeOf['getAvailableSnapshot']>> {
    const runtime = await this.#runtimeNow()

    const available = await runtime.getAvailable()
    // A machine with no credentials at all gets an empty list, and the selector
    // says so — better than offering models that cannot run.
    return available.length > 0 ? available : runtime.getAvailableSnapshot()
  }

  /** The model a session runs on.
   *
   *  A child may name its own as `provider/id`; naming none means it borrows
   *  whatever the app is configured with, which is what "inherits the parent's
   *  model" amounts to here. */
  async resolve(named?: string): Promise<ResolvedModel> {
    const wanted = named ? splitModel(named) : this.#own
    if (!wanted) return undefined

    const model = (await this.#runtimeNow()).getModel(wanted.provider, wanted.id)
    if (!model) {
      throw new Error(`pi has no model "${wanted.provider}/${wanted.id}" configured`)
    }
    return model
  }

  /** The model a child runs on, falling back rather than failing.
   *
   *  A role ships with a model id, and an id ages: the model is retired, or the
   *  user never configured that provider. Failing the child there would mean a
   *  fan-out that dies on first use because of a default nobody chose — proven
   *  live, where the shipped `scout` named a model this machine did not have and
   *  every scout failed before running. It falls back to the session's own model
   *  and says so, because a child quietly running on a model ten times the price
   *  of the one its role names is worse than a warning.
   *
   *  Reports which model won as well as the model itself, because a fallback is
   *  exactly when the reader needs to know: the peek names what the child is
   *  running on, not what its role asked for. */
  async forChild(named: string | undefined, warn?: (warning: string) => void): Promise<Chosen> {
    if (named) {
      try {
        return { model: await this.resolve(named), named }
      } catch {
        warn?.(`model "${named}" is not configured here; used this session's model instead`)
      }
    }

    const own = this.#own
    return {
      model: await this.resolve(),
      ...(own ? { named: `${own.provider}/${own.id}` } : {}),
    }
  }

  async #runtimeNow(): Promise<ModelRuntimeOf> {
    const { ModelRuntime } = await this.#load()
    this.#runtime ??= ModelRuntime.create()
    return this.#runtime
  }
}

/** `provider/id`, the way pi's own config and its `--model` flag spell it.
 *
 *  Split on the first slash only: a model id may contain slashes of its own
 *  (`anthropic/claude-…` versus an OpenRouter id like `x-ai/grok`), and the
 *  provider never does. */
function splitModel(named: string): ModelRef {
  const at = named.indexOf('/')
  if (at === -1) throw new Error(`model "${named}" needs the form provider/id`)
  return { provider: named.slice(0, at), id: named.slice(at + 1) }
}
