/** When an editor column shows the rendered markdown view instead of the
 *  source (spec: pane-reveal-and-editor). Pure, so the swap contract tests
 *  without a DOM: only markdown files render, and only while the reader is
 *  not in vim *on this column* — an unfocused markdown column stays
 *  rendered even when some other column holds a vim mode. */

import { isVimMode, type Mode } from '../types'

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path)
}

export function readsRendered(path: string, focused: boolean, mode: Mode): boolean {
  return isMarkdownPath(path) && !(focused && isVimMode(mode))
}
