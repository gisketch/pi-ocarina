/** The chip field's text model.
 *
 *  The composer's field is a `contenteditable` whose children are text nodes
 *  and chip elements. The one invariant everything rests on: the DOM
 *  serializes to exactly the composer string — a text node is its text, a
 *  chip is its `data-token`, a `<br>` is a newline. Every consumer of the
 *  old textarea (menus, folds, staged names) keeps thinking in that string;
 *  these helpers are the only place the two worlds meet.
 *
 *  A chip is `contenteditable="false"`, which is what makes it atomic: the
 *  browser cannot put a caret inside one or delete half of one. Its label
 *  and icon are free to look like anything — the token is what it *is*. */

import { iconSvg, type IconName } from './icons'

/** What the composer's consumers need from a field — the corner of the
 *  textarea interface they always used, now spoken by the chip field's
 *  handle too. A real `<textarea>` satisfies it structurally. */
export interface CaretField {
  readonly value: string
  readonly selectionStart: number
  readonly selectionEnd: number
  setSelectionRange(start: number, end: number): void
  focus(): void
}

export interface ChipSpec {
  /** The exact composer-string text this chip stands for. */
  token: string
  /** What the chip displays — free of the token's syntax. */
  label: string
  icon: IconName
  tone: 'accent' | 'warn' | 'dim'
}

/** One chip element. The classes are `global.css`'s `.inline-chip`, shared
 *  with the transcript's Chip component, so both draw the same chip. */
export function chipNode(doc: Document, spec: ChipSpec): HTMLElement {
  const chip = doc.createElement('span')
  chip.className = `inline-chip ${spec.tone}`
  chip.contentEditable = 'false'
  chip.dataset.token = spec.token

  const icon = doc.createElement('span')
  icon.className = 'chip-icon'
  // A build-time constant from the icon registry — never content.
  icon.innerHTML = iconSvg(spec.icon)
  chip.append(icon, doc.createTextNode(spec.label))
  return chip
}

const tokenOf = (node: Node): string | null =>
  node instanceof HTMLElement ? (node.dataset.token ?? null) : null

const isBr = (node: Node): boolean => node.nodeName === 'BR'

/** One child's worth of serialized text. */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  const token = tokenOf(node)
  if (token !== null) return token
  if (isBr(node)) return '\n'
  // Anything else the browser slipped in serializes as its children.
  return [...node.childNodes].map(textOf).join('')
}

/** The composer string this DOM holds.
 *
 *  A `<br>` as the very last node is the browser's own padding — the caret's
 *  seat on an empty line, not a newline the reader typed — and is dropped. */
export function serialize(root: Node): string {
  const children = [...root.childNodes]
  const last = children.length - 1
  return children
    .map((node, at) => (at === last && isBr(node) ? '' : textOf(node)))
    .join('')
}

/** The serialized index of a selection endpoint.
 *
 *  `offset` is a DOM offset: a character index in a text node, or a child
 *  index in an element. An endpoint inside a chip counts as the chip's end —
 *  the chip is atomic, so there is nowhere inside it to be. */
export function caretOffset(root: Node, node: Node, offset: number): number {
  if (node === root) {
    return [...root.childNodes].slice(0, offset).map(textOf).join('').length
  }

  let at = 0
  for (const child of root.childNodes) {
    if (child === node || child.contains(node)) {
      if (child.nodeType === Node.TEXT_NODE) return at + offset
      const token = tokenOf(child)
      if (token !== null) return at + token.length
      return at + caretOffset(child, node, offset)
    }
    at += textOf(child).length
  }
  return at
}

/** The DOM position for a serialized index.
 *
 *  Inside a text node when the index is; past the chip when the index falls
 *  inside a token — never inside one. The end of the string is the end of
 *  the field. */
export function caretPosition(
  root: Node,
  index: number,
): { node: Node; offset: number } {
  let at = 0
  const children = [...root.childNodes]

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    const length = textOf(child).length

    if (index <= at + length) {
      if (child.nodeType === Node.TEXT_NODE && index < at + length) {
        return { node: child, offset: index - at }
      }
      if (child.nodeType === Node.TEXT_NODE && index === at + length) {
        // The boundary belongs to the text node, so typing continues it.
        return { node: child, offset: length }
      }
      // A chip, a `<br>`, or something the browser slipped in: the caret sits
      // between children, after this one — or before it, when the index is
      // exactly at its start.
      return { node: root, offset: index === at ? i : i + 1 }
    }
    at += length
  }
  return { node: root, offset: children.length }
}
