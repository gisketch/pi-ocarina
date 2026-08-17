/** The chosen part of the page, written out as Markdown.
 *
 *  Markdown because the renderer already draws it and the model already reads
 *  it. The alternative — handing over stripped plain text — throws away the
 *  structure that makes a documentation page worth fetching: which line was a
 *  heading, which run was code, where the link pointed. */

import { isElement, type HtmlChild, type HtmlNode } from './html-tree'

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }

/** Phrasing content: everything that belongs on one line. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ')

function inline(child: HtmlChild): string {
  if (!isElement(child)) return collapse(child)

  const inner = child.children.map(inline).join('')

  switch (child.name) {
    case 'br':
      return '\n'
    case 'img': {
      const alt = child.attrs.alt?.trim() ?? ''
      return alt === '' ? '' : `![${alt}]`
    }
    case 'a': {
      const href = child.attrs.href?.trim() ?? ''
      const text = inner.trim()
      if (text === '') return ''
      // A link to a script, or to nowhere, is text. Carrying `javascript:` into
      // the model's context offers it something it must never be asked to run.
      if (href === '' || /^javascript:/i.test(href) || href.startsWith('#')) return text
      return `[${text}](${href})`
    }
    case 'code':
    case 'kbd':
    case 'samp': {
      const text = inner.trim()
      return text === '' ? '' : `\`${text}\``
    }
    case 'strong':
    case 'b': {
      const text = inner.trim()
      return text === '' ? '' : `**${text}**`
    }
    case 'em':
    case 'i': {
      const text = inner.trim()
      return text === '' ? '' : `*${text}*`
    }
    default:
      return inner
  }
}

const tidy = (text: string): string => text.replace(/[ \t]+\n/g, '\n').trim()

/** Text of a node as one line, for headings, cells and list items. */
function line(node: HtmlNode): string {
  return tidy(node.children.map(inline).join(''))
}

class Writer {
  readonly blocks: string[] = []

  add(block: string): void {
    const text = block.trim()
    if (text !== '') this.blocks.push(text)
  }

  /** Prefixes every line of everything written by `work`, for a quote. */
  nested(prefix: string, work: (writer: Writer) => void): void {
    const inner = new Writer()
    work(inner)
    const text = inner.blocks.join('\n\n')
    if (text === '') return
    this.add(
      text
        .split('\n')
        .map((one) => (one === '' ? prefix.trimEnd() : prefix + one))
        .join('\n'),
    )
  }
}

/** A list is lines, not blocks.
 *
 *  Returning lines rather than writing them is what keeps a nested list
 *  indented: `Writer.add` trims, and a sublist's whole contribution is its
 *  leading whitespace. */
function listLines(node: HtmlNode, ordered: boolean, depth: number): string[] {
  const pad = '  '.repeat(depth)
  const lines: string[] = []
  let index = 0

  for (const child of node.children) {
    if (!isElement(child) || child.name !== 'li') continue
    index += 1

    // A list item's own nested lists are written under it, not beside it.
    const sublists = child.children.filter(
      (one): one is HtmlNode => isElement(one) && (one.name === 'ul' || one.name === 'ol'),
    )
    const own: HtmlNode = {
      ...child,
      children: child.children.filter((one) => !sublists.includes(one as HtmlNode)),
    }

    const marker = ordered ? `${index}. ` : '- '
    const text = line(own)
    if (text !== '') lines.push(pad + marker + text.split('\n').join(' '))

    for (const sublist of sublists) {
      lines.push(...listLines(sublist, sublist.name === 'ol', depth + 1))
    }
  }

  return lines
}

function writeTable(node: HtmlNode, writer: Writer): void {
  const rows: string[] = []
  let header = false

  const walk = (current: HtmlNode): void => {
    for (const child of current.children) {
      if (!isElement(child)) continue
      if (child.name === 'tr') {
        const cells = child.children.filter(
          (one): one is HtmlNode => isElement(one) && (one.name === 'td' || one.name === 'th'),
        )
        if (cells.length === 0) continue
        rows.push(`| ${cells.map((cell) => line(cell) || ' ').join(' | ')} |`)
        if (!header && cells.every((cell) => cell.name === 'th')) {
          rows.push(`| ${cells.map(() => '---').join(' | ')} |`)
          header = true
        }
        continue
      }
      walk(child)
    }
  }
  walk(node)

  if (rows.length > 0) writer.add(rows.join('\n'))
}

function writeBlock(node: HtmlNode, writer: Writer): void {
  const heading = HEADINGS[node.name]
  if (heading !== undefined) {
    const text = line(node)
    if (text !== '') writer.add(`${'#'.repeat(heading)} ${text.split('\n').join(' ')}`)
    return
  }

  switch (node.name) {
    case 'p':
      writer.add(line(node))
      return
    case 'hr':
      writer.add('---')
      return
    case 'pre': {
      // The one place whitespace is the content, so `inline`'s collapsing is
      // exactly wrong and the raw text is taken instead.
      const text = rawText(node).replace(/\n+$/, '')
      if (text.trim() !== '') writer.add(`\`\`\`\n${text}\n\`\`\``)
      return
    }
    case 'blockquote':
      writer.nested('> ', (inner) => writeChildren(node, inner))
      return
    case 'ul':
    case 'ol': {
      const lines = listLines(node, node.name === 'ol', 0)
      if (lines.length > 0) writer.add(lines.join('\n'))
      return
    }
    case 'table':
      writeTable(node, writer)
      return
    case 'dl':
    case 'figure':
    case 'figcaption':
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'body':
    case '#root':
      writeChildren(node, writer)
      return
    default:
      writeChildren(node, writer)
  }
}

function rawText(node: HtmlNode): string {
  return node.children.map((child) => (isElement(child) ? rawText(child) : child)).join('')
}

/** Whether this element belongs on a line of its own. */
const BLOCK = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'ul',
  'ol',
  'table',
  'pre',
  'blockquote',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'dl',
  'figure',
  'figcaption',
  'body',
  '#root',
  'header',
  'footer',
])

function writeChildren(node: HtmlNode, writer: Writer): void {
  // Loose phrasing between blocks — a bare sentence inside a `<div>` — is a
  // paragraph. Dropping it would lose real prose on hand-written pages.
  let run: HtmlChild[] = []
  const flush = (): void => {
    if (run.length === 0) return
    writer.add(tidy(run.map(inline).join('')))
    run = []
  }

  for (const child of node.children) {
    if (isElement(child) && (BLOCK.has(child.name) || HEADINGS[child.name] !== undefined)) {
      flush()
      writeBlock(child, writer)
      continue
    }
    run.push(child)
  }
  flush()
}

/** Markdown for one node's subtree. */
export function toMarkdown(node: HtmlNode): string {
  const writer = new Writer()
  writeBlock(node, writer)
  return writer.blocks.join('\n\n')
}
