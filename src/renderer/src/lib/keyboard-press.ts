/** Presses a run of keys through the reducer, threading the state.
 *
 *  Shared by the two keyboard suites: one helper, so a change to how a press
 *  is modelled cannot be true in one file and stale in the other. */

import { type KeyContext, type KeyEventLike, type KeyState, reduceKey } from './keyboard'

export function press(
  ctx: KeyContext,
  state: KeyState,
  ...keys: (string | KeyEventLike)[]
): { state: KeyState; actions: ReturnType<typeof reduceKey>['actions']; last: ReturnType<typeof reduceKey> } {
  let current = state
  let actions: ReturnType<typeof reduceKey>['actions'] = []
  let last!: ReturnType<typeof reduceKey>

  for (const key of keys) {
    last = reduceKey(current, typeof key === 'string' ? { key } : key, ctx)
    current = last.state
    actions = actions.concat(last.actions)
  }

  return { state: current, actions, last }
}
