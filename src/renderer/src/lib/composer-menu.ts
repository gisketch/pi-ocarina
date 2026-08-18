/** What a key means while the completion menu is open.
 *
 *  Pure, and held outside the composer because it is the one part of that file
 *  a test can reach: the composer is a component in a repository with no DOM
 *  harness, and these are the rules a reader would most want checked — which
 *  keys the menu takes, and which it leaves to the field underneath it.
 *
 *  Returns null for a key the menu does not want, which is how the caller
 *  tells "handled" from "let it through". */

import { wrapIndex } from './fuzzy'

export type MenuKind = 'slash' | 'mention'

export type MenuAction =
  /** Move the highlight to this index. */
  | { kind: 'move'; to: number }
  /** Take the option at this index. */
  | { kind: 'choose'; index: number }
  /** Close the menu, keeping the caret where it is. */
  | { kind: 'dismiss' }

export function menuKey(
  event: { key: string; shiftKey?: boolean },
  menu: MenuKind,
  active: number,
  options: number,
): MenuAction | null {
  switch (event.key) {
    case 'ArrowDown':
      return { kind: 'move', to: wrapIndex(active + 1, options) }
    case 'ArrowUp':
      return { kind: 'move', to: wrapIndex(active - 1, options) }
    case 'Tab':
      // Tab completes a path, which is what a file picker trains fingers to
      // expect. It has no meaning for the command list, so the field keeps it.
      return menu === 'mention' ? { kind: 'choose', index: active } : null
    case 'Enter':
      // `shift+⏎` is a newline everywhere else in the field, and a menu that
      // stole it would end the message instead of continuing it.
      return event.shiftKey === true ? null : { kind: 'choose', index: active }
    case 'Escape':
      // Without leaving INSERT: the person is still writing, they simply do
      // not want the list.
      return { kind: 'dismiss' }
    default:
      return null
  }
}
