/** Chat modes, as operations on catalog state.
 *
 *  Functions rather than more methods on the store: the store had reached the
 *  file's line limit, and "which voice is set" is a different question from
 *  "which folders are pinned". The store keeps the writes — it owns persistence
 *  — and hands the state here. */

import { resolveMode, type ChatMode } from '../shared/chat-modes'
import type { CatalogState } from './catalog'

export function modeFor(state: CatalogState, threadMode?: string): ChatMode | undefined {
  return resolveMode(threadMode, state.preferences.defaultMode, state.modes)
}

/** Adds or replaces one, by id. */
export function saveMode(state: CatalogState, mode: ChatMode): void {
  const at = state.modes.findIndex((one) => one.id === mode.id)
  if (at === -1) state.modes = [...state.modes, mode]
  else state.modes = state.modes.map((one) => (one.id === mode.id ? mode : one))
}

/** Removes a mode, and any pointer at it.
 *
 *  A dangling default resolves to no voice anyway, but leaving it there means
 *  the settings screen shows a default nobody can see and nobody can clear. */
export function deleteMode(state: CatalogState, modeId: string): void {
  state.modes = state.modes.filter((one) => one.id !== modeId)
  if (state.preferences.defaultMode === modeId) setDefaultMode(state, undefined)
}

export function setDefaultMode(state: CatalogState, modeId: string | undefined): void {
  const { defaultMode: _dropped, ...rest } = state.preferences
  state.preferences = modeId === undefined ? rest : { ...rest, defaultMode: modeId }
}
