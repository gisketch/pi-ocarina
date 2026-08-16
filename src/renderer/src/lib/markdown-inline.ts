/** Inline markers, in one pass.
 *
 *  The marks are flags on a flat run rather than a tree, because they compose:
 *  a bold word inside a link inside a sentence is one run with two flags, and a
 *  tree would make the renderer walk depth it never needs.
 *
 *  Every paired marker follows the same rule — it only counts when something
 *  closes it. An agent writes `x ** y` for exponentiation, `a * b` for
 *  multiplication and `snake_case` for names far more often than it writes
 *  emphasis, and reading an opener that never closes would eat the characters
 *  and style the rest of the sentence. */

export interface InlineSegment {
  text: string
  code: boolean
  /** Omitted rather than false, so a plain run stays the shape it was. */
  bold?: boolean
  italic?: boolean
  strike?: boolean
  /** Set when the run is part of a link. Already checked as safe to follow. */
  href?: string
}

/** Schemes a link may use. An allow-list: the renderer hands these to the
 *  operating system, and `javascript:` or `file:` in a message an agent wrote
 *  is not something a reader ever meant to click. */
const SAFE_SCHEME = /^(https?:|mailto:)/i

export function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (SAFE_SCHEME.test(trimmed)) return trimmed
  // A bare `example.com/x` is the common way an agent writes a URL.
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return null
}

/** Bare URLs an agent dropped into prose without link syntax. */
const AUTOLINK = /(https?:\/\/[^\s<>()[\]]+|www\.[^\s<>()[\]]+)/

interface Mark {
  /** The characters that open and close the run. */
  marker: string
  flag: 'bold' | 'italic' | 'strike'
}

/** Longest first: `**` must be tried before `*`, or bold reads as two italics. */
const MARKS: Mark[] = [
  { marker: '**', flag: 'bold' },
  { marker: '~~', flag: 'strike' },
  { marker: '*', flag: 'italic' },
]

interface Open {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  href?: string
}

/** Whether `marker` closes again after `from`, outside inline code. */
function closes(text: string, from: number, marker: string): boolean {
  let code = false
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '`') {
      code = !code
      continue
    }
    if (!code && text.startsWith(marker, at)) return true
  }
  return false
}

/** Reads `[label](url)` at `at`, or null. */
function linkAt(text: string, at: number): { label: string; href: string; end: number } | null {
  if (text[at] !== '[') return null

  const close = text.indexOf('](', at)
  if (close === -1) return null

  const end = text.indexOf(')', close + 2)
  if (end === -1) return null

  const href = safeHref(text.slice(close + 2, end))
  if (href === null) return null

  return { label: text.slice(at + 1, close), href, end: end + 1 }
}

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let buffer = ''
  let code = false
  const open: Open = {}

  const push = (): void => {
    if (buffer === '') return
    segments.push({ text: buffer, code, ...open })
    buffer = ''
  }

  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '`') {
      push()
      code = !code
      continue
    }

    if (code) {
      buffer += text[at]
      continue
    }

    const link = open.href === undefined ? linkAt(text, at) : null
    if (link) {
      push()
      // The label is parsed too, so a bold word inside a link keeps its weight.
      for (const part of parseInline(link.label)) {
        segments.push({ ...part, ...open, href: link.href })
      }
      at = link.end - 1
      continue
    }

    const mark = MARKS.find((candidate) => text.startsWith(candidate.marker, at))
    if (mark && (open[mark.flag] || closes(text, at + mark.marker.length, mark.marker))) {
      push()
      if (open[mark.flag]) delete open[mark.flag]
      else open[mark.flag] = true
      at += mark.marker.length - 1
      continue
    }

    if (open.href === undefined) {
      const bare = AUTOLINK.exec(text.slice(at))
      if (bare && bare.index === 0) {
        push()
        const href = safeHref(bare[0])
        segments.push(href === null ? { text: bare[0], code } : { text: bare[0], code, ...open, href })
        at += bare[0].length - 1
        continue
      }
    }

    buffer += text[at]
  }

  push()
  return segments
}
