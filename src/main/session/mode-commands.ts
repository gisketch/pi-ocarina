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

  /** Drops every thread override pointing at a mode that no longer exists.
   *
   *  A dangling override resolves to no voice, which is survivable — but the
   *  thread would report itself as overridden with nothing to show for it, and
   *  the picker would offer "use the default" for a choice already gone. */
  forgetMode(modeId: string): void {
    for (const [threadId, chosen] of this.#overrides) {
      if (chosen === modeId) this.#overrides.delete(threadId)
    }
  }

  set(threadId: string, modeId: string | undefined): void {
    if (modeId === undefined) this.#overrides.delete(threadId)
    else this.#overrides.set(threadId, modeId)
  }
}

/** Re-reads a thread's resources so a voice change reaches the running session.
 *
 *  pi assembles the system prompt once and caches it, so a mode that only
 *  changed the catalog would not be heard until the thread was reopened — and
 *  the picker would have said it changed something that did not. */
export type RefreshThread = (threadId: string) => Promise<void>

/** The commands behind the picker and the settings screen. */
export function handleModes(
  modes: ModeControl,
  catalog: CatalogStore,
  name: CommandName,
  params: unknown,
  refresh?: RefreshThread,
): unknown {
  switch (name) {
    case 'listModes': {
      const { threadId } = params as CommandParams<'listModes'>
      const fallback = catalog.modeFor(undefined)
      // No thread means no override to find: a column with no session speaks
      // in the default, and says so without claiming to have chosen it.
      const current = threadId === undefined ? fallback : modes.modeOf(threadId)
      return {
        modes: catalog.modes(),
        ...(current ? { current: current.id } : {}),
        overridden: threadId !== undefined && modes.overridden(threadId),
        ...(fallback ? { fallbackMode: fallback.id } : {}),
      }
    }

    case 'setThreadMode': {
      const { threadId, modeId } = params as CommandParams<'setThreadMode'>
      modes.set(threadId, modeId)
      // Not awaited: the picker has closed, and a voice that arrives a
      // moment later is right either way.
      void refresh?.(threadId)
      return { ok: true }
    }

    case 'setDefaultMode': {
      const { modeId, threadId } = params as CommandParams<'setDefaultMode'>
      catalog.setDefaultMode(modeId)
      // Only the thread that asked. Every other open thread keeps the voice it
      // was built with until it is reopened — a default is for new threads, and
      // rewriting the instructions under a turn nobody is watching is worse
      // than being a moment late.
      if (threadId !== undefined) void refresh?.(threadId)
      return { ok: true }
    }

    case 'saveMode': {
      const { mode } = params as CommandParams<'saveMode'>
      return catalog.saveMode(mode)
    }

    default: {
      const { modeId } = params as CommandParams<'deleteMode'>
      catalog.deleteMode(modeId)
      modes.forgetMode(modeId)
      return { ok: true }
    }
  }
}
