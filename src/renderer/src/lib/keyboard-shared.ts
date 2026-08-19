/** The small constructors both halves of the key reducer speak in.
 *
 *  Split from `keyboard.ts` when the leader chord moved to its own file: the
 *  two reducers share these, and neither should have to import the other to
 *  say "a result" or "which workspace a digit means". */

import type { Action, KeyResult, KeyState, Overlay } from './keyboard-types'

export function result(
  state: KeyState,
  actions: Action[] = [],
  preventDefault = true,
  timer: KeyResult['timer'] = null,
): KeyResult {
  return { state, actions, preventDefault, timer }
}

export function digitFor(key: string, count: number): number | null {
  if (key.length !== 1) return null
  const n = Number(key)
  if (!Number.isInteger(n) || n < 1 || n > count) return null
  return n - 1
}

export function focusFor(overlay: Overlay | null): Action[] {
  if (overlay === 'palette') return [{ type: 'focusPalette' }]
  if (overlay === 'switcher') return [{ type: 'focusSwitcher' }]
  return []
}
