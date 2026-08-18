/** The voice each thread writes in.
 *
 *  Holds the per-thread overrides, resolves what a session should carry, and
 *  answers the commands the settings screen and the picker send. Split from the
 *  driver for the reason the roles and permission commands were: it is about
 *  stored state and a small map, not about running a turn.
 *
 *  An override is session-scoped and never written to the catalog. A thread's
 *  voice is something the reader did to the column in front of them, not a
 *  setting the app should still be enforcing after a relaunch. */

import { modePrompt, type ChatMode } from '../../shared/chat-modes'
import type { CommandName, CommandParams } from '../../shared/commands'
import type { CatalogStore } from '../catalog-store'

export class ModeControl {
  readonly #catalog: CatalogStore
  readonly #overrides = new Map<string, string>()

  constructor(catalog: CatalogStore) {
    this.#catalog = catalog
  }

  /** What this thread's system prompt carries. Empty when no mode is set,
   *  which is what "normal" is. */
  promptFor(threadId: string): string[] {
    return modePrompt(this.#catalog.modeFor(this.#overrides.get(threadId)))
  }

  /** The mode in force for a thread, for the status bar. */
  modeOf(threadId: string): ChatMode | undefined {
    return this.#catalog.modeFor(this.#overrides.get(threadId))
  }

  /** Whether this thread chose a voice of its own rather than inheriting. */
  overridden(threadId: string): boolean {
    return this.#overrides.has(threadId)
  }

  forget(threadId: string): void {
    this.#overrides.delete(threadId)
  }

  set(threadId: string, modeId: string | undefined): void {
    if (modeId === undefined) this.#overrides.delete(threadId)
    else this.#overrides.set(threadId, modeId)
  }
}

/** The commands behind the picker and the settings screen. */
export function handleModes(modes: ModeControl, catalog: CatalogStore, name: CommandName, params: unknown): unknown {
  switch (name) {
    case 'listModes': {
      const { threadId } = params as CommandParams<'listModes'>
      const current = modes.modeOf(threadId)
      return {
        modes: catalog.modes(),
        ...(current ? { current: current.id } : {}),
        overridden: modes.overridden(threadId),
      }
    }

    case 'setThreadMode': {
      const { threadId, modeId } = params as CommandParams<'setThreadMode'>
      modes.set(threadId, modeId)
      return { ok: true }
    }

    case 'setDefaultMode': {
      const { modeId } = params as CommandParams<'setDefaultMode'>
      catalog.setDefaultMode(modeId)
      return { ok: true }
    }

    case 'saveMode': {
      const { mode } = params as CommandParams<'saveMode'>
      return catalog.saveMode(mode)
    }

    default: {
      const { modeId } = params as CommandParams<'deleteMode'>
      catalog.deleteMode(modeId)
      return { ok: true }
    }
  }
}
