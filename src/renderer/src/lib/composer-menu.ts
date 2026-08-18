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
  /** Take the option at this index — run it if it runs, write it if it does
   *  not. */
  | { kind: 'choose'; index: number }
  /** Write the option at this index into the sentence, never run it. */
  | { kind: 'insert'; index: number }
  /** Close the menu, keeping the caret where it is. */
  | { kind: 'dismiss' }

export function menuKey(
  event: { key: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  menu: MenuKind,
  active: number,
  options: number,
): MenuAction | null {
  // While a picker is open, ⌘j and ⌘k walk it — including ⌘k, which everywhere
  // else opens the command palette. A reader inside a list is reaching for the
  // list, and the palette is one `esc` away.
  if (event.metaKey === true || event.ctrlKey === true) {
    if (event.key === 'j') return { kind: 'move', to: wrapIndex(active + 1, options) }
    if (event.key === 'k') return { kind: 'move', to: wrapIndex(active - 1, options) }
    return null
  }

  switch (event.key) {
    case 'ArrowDown':
      return { kind: 'move', to: wrapIndex(active + 1, options) }
    case 'ArrowUp':
      return { kind: 'move', to: wrapIndex(active - 1, options) }
    case 'Tab':
      // Tab writes the highlighted entry into the sentence — a path from the
      // file picker, a skill from the command menu. That is what a completion
      // key means, and it is what lets two skills be named in one message.
      return { kind: 'insert', index: active }
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
