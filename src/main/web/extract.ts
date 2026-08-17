/** HTML in, readable Markdown out. The whole point of the fetch tool.
 *
 *  Three steps, each testable on its own: tokenize, pick the part of the page
 *  that is the page, write it as Markdown. */

import { documentTitle, parse, pickContent } from './html-tree'
import { toMarkdown } from './to-markdown'

export interface Extracted {
  /** The document's `<title>`, when it has one. */
  title: string
  markdown: string
}

export function extractArticle(html: string): Extracted {
  const root = parse(html)
  const title = documentTitle(root)
  const content = pickContent(root)
  let markdown = toMarkdown(content)

  // A page whose content carries no heading of its own gets the document
  // title, so the reader and the model both know what they are looking at.
  if (title !== '' && !markdown.startsWith('#')) {
    markdown = markdown === '' ? `# ${title}` : `# ${title}\n\n${markdown}`
  }

  return { title, markdown }
}

/** Whether a content type is worth converting, worth passing through, or
 *  neither.
 *
 *  JSON and plain text are already what the model wants; converting them would
 *  corrupt them. A binary is described, never decoded. */
export function bodyKind(contentType: string): 'html' | 'text' | 'binary' {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (type === '' ) return 'text'
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html'
  if (type.startsWith('text/')) return 'text'
  if (type === 'application/json' || type.endsWith('+json')) return 'text'
  if (type === 'application/xml' || type.endsWith('+xml')) return 'text'
  if (type === 'application/javascript' || type === 'application/ecmascript') return 'text'
  return 'binary'
}
