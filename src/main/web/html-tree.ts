/** Tokens become a small tree, and the tree gives up its article.
 *
 *  The only reason a tree exists at all is the question "which part of this
 *  page is the page": answering it means comparing how much text lives under
 *  each candidate, and a flat token stream cannot compare subtrees. */

import { tokenize, type HtmlToken } from './html-text'

export interface HtmlNode {
  name: string
  attrs: Record<string, string>
  children: HtmlChild[]
}

export type HtmlChild = HtmlNode | string

export function isElement(child: HtmlChild): child is HtmlNode {
  return typeof child !== 'string'
}

/** Chrome, not content. Dropped whole, subtree and all.
 *
 *  `header` and `footer` are here even though a header sometimes holds the
 *  title, because far more often it holds a logo and a menu. The document's
 *  `<title>` covers the case this loses. */
const DROP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'select',
  'iframe',
  'dialog',
])

/** How deep the tree may get.
 *
 *  Every walk over it — measuring text, choosing the article, writing Markdown,
 *  rendering a run of inline marks — is recursive, so the depth of a fetched
 *  page is the depth of this app's call stack. A page of ten thousand nested
 *  `<div>`s overflowed it and failed the fetch. Real pages do not go past about
 *  thirty; past this, nesting carries no structure worth keeping, and the text
 *  inside it is kept anyway. */
export const MAX_DEPTH = 100

/** Tags that close a sibling of their own kind. A page full of unclosed `<li>`
 *  is the normal case, not the broken one. */
const CLOSED_BY_SELF = new Set(['li', 'p', 'tr', 'td', 'th', 'dt', 'dd', 'option'])

/** Blocks that end an open paragraph. */
const CLOSES_P = new Set([
  'p',
  'div',
  'section',
  'article',
  'ul',
  'ol',
  'li',
  'table',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
])

/** Builds the tree, dropping the subtrees that are never content. */
export function parse(html: string): HtmlNode {
  const root: HtmlNode = { name: '#root', attrs: {}, children: [] }
  const stack: HtmlNode[] = [root]
  // Depth of a dropped subtree. While this is above zero nothing is kept, so a
  // `<nav>` containing a `<script>` unwinds correctly.
  let dropped = 0
  /** Open elements past `MAX_DEPTH`. Balanced like `dropped`, but their text is
   *  kept — the structure is what is refused, not the content. */
  let deep = 0

  const top = (): HtmlNode => stack[stack.length - 1]

  for (const token of tokenize(html)) {
    if (deep > 0) {
      if (token.type === 'text') {
        if (token.text !== '') top().children.push(token.text)
      } else if (token.type === 'open' && !token.selfClosing && !DROP.has(token.name)) {
        deep += 1
      } else if (token.type === 'close') {
        deep -= 1
      }
      continue
    }

    if (dropped > 0) {
      if (token.type === 'open' && !token.selfClosing && DROP.has(token.name)) dropped += 1
      else if (token.type === 'close' && DROP.has(token.name)) dropped -= 1
      continue
    }

    if (token.type === 'text') {
      if (token.text !== '') top().children.push(token.text)
      continue
    }

    if (token.type === 'close') {
      const at = lastIndexOfName(stack, token.name)
      // A close with no open is noise; ignoring it keeps the rest of the page.
      if (at > 0) stack.length = at
      continue
    }

    if (DROP.has(token.name)) {
      if (!token.selfClosing) dropped += 1
      continue
    }

    closeImplied(stack, token)

    if (!token.selfClosing && stack.length >= MAX_DEPTH) {
      deep = 1
      continue
    }

    const node: HtmlNode = { name: token.name, attrs: token.attrs, children: [] }
    top().children.push(node)
    if (!token.selfClosing) stack.push(node)
  }

  return root
}

function lastIndexOfName(stack: HtmlNode[], name: string): number {
  for (let i = stack.length - 1; i > 0; i -= 1) {
    if (stack[i].name === name) return i
  }
  return -1
}

function closeImplied(stack: HtmlNode[], token: HtmlToken & { type: 'open' }): void {
  const open = stack[stack.length - 1].name
  if (CLOSED_BY_SELF.has(token.name) && open === token.name) {
    stack.pop()
    return
  }
  if (open === 'p' && CLOSES_P.has(token.name)) stack.pop()
}

/** How much text lives under a node. The measure the article choice turns on. */
export function textLength(node: HtmlNode): number {
  let total = 0
  for (const child of node.children) {
    total += isElement(child) ? textLength(child) : child.trim().length
  }
  return total
}

function collect(node: HtmlNode, want: (node: HtmlNode) => boolean, found: HtmlNode[]): void {
  if (want(node)) found.push(node)
  for (const child of node.children) if (isElement(child)) collect(child, want, found)
}

export function find(root: HtmlNode, name: string): HtmlNode | null {
  const found: HtmlNode[] = []
  collect(root, (node) => node.name === name, found)
  return found[0] ?? null
}

/** The part of the page that is the page.
 *
 *  The densest `article` or `main` wins. If the page marks neither — or marks
 *  one and puts nothing in it, which a template will — the body is the answer,
 *  because a thin wrapper is worse than a fat one. */
export function pickContent(root: HtmlNode): HtmlNode {
  const candidates: HtmlNode[] = []
  collect(
    root,
    (node) => node.name === 'article' || node.name === 'main' || node.attrs.role === 'main',
    candidates,
  )

  const body = find(root, 'body') ?? root
  const bodyText = textLength(body)

  let best: HtmlNode | null = null
  let bestText = 0
  for (const candidate of candidates) {
    const length = textLength(candidate)
    if (length > bestText) {
      best = candidate
      bestText = length
    }
  }

  // A tenth of the page is the line between "the article" and "a teaser box
  // that happens to be marked up as one".
  if (best && bestText >= Math.max(200, bodyText / 10)) return best
  return body
}

/** The document's title, for a page whose content has no heading of its own. */
export function documentTitle(root: HtmlNode): string {
  const title = find(root, 'title')
  if (!title) return ''
  return title.children
    .filter((child): child is string => !isElement(child))
    .join('')
    .trim()
}
