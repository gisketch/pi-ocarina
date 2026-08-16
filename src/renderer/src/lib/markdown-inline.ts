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

  // A bare `www.example.com/x` is the common way an agent writes a URL. The
  // `@` check is the catch: `www.paypal.com@evil.test` reads as one host and
  // resolves to another, and a reader has no way to see which.
  if (/^www\./i.test(trimmed) && !trimmed.split('/')[0].includes('@')) {
    return `https://${trimmed}`
  }
  return null
}

/** Bare URLs an agent dropped into prose without link syntax.
 *
 *  Sticky, so it can be anchored at an index. Slicing the tail to test each
 *  character instead would allocate a copy of the rest of the line per
 *  character — quadratic, on text that is re-parsed every streamed token. */
const AUTOLINK = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/y

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

/** How far ahead a marker or a link is looked for.
 *
 *  Both scans are per-candidate, so an unbounded look-ahead makes a line of
 *  ten thousand `[` quadratic — and a message is re-parsed on every streamed
 *  token, so that cost lands once per token. No real emphasis or link spans
 *  more than a line's worth of text; past this it is not markup. */
const LOOK_AHEAD = 2000

/** Whether `marker` closes again after `from`, outside inline code.
 *
 *  Short-circuited through the same cache: a marker that does not occur again
 *  cannot close, and the scan below only ever walks as far as an occurrence
 *  that does exist. */
function closes(text: string, from: number, marker: string, seek: Seek): boolean {
  if (seek.from(text, marker, from) === -1) return false

  let code = false
  const limit = Math.min(text.length, from + LOOK_AHEAD)
  for (let at = from; at < limit; at += 1) {
    if (text[at] === '`') {
      code = !code
      continue
    }
    if (!code && text.startsWith(marker, at)) return true
  }
  return false
}

/** Where a needle next appears at or after `from`, remembered across calls.
 *
 *  This is what keeps the parse linear. A failed `indexOf` scans to the end of
 *  the line, and a line of ten thousand `[` would pay that per bracket. So the
 *  answer is cached: `at` only ever advances, so a hit at or after the new
 *  position is still the right answer and costs nothing, and a miss is final.
 *  Caching only the misses is not enough — a needle that exists but sits far
 *  away is rescanned from every candidate, which is the same quadratic wearing
 *  a different hat. */
class Seek {
  #found = new Map<string, number>()

  from(text: string, needle: string, at: number): number {
    const known = this.#found.get(needle)
    if (known !== undefined && (known === -1 || known >= at)) return known

    const found = text.indexOf(needle, at)
    this.#found.set(needle, found)
    return found
  }
}

/** Reads `[label](url)` at `at`, or null. */
function linkAt(
  text: string,
  at: number,
  seek: Seek,
): { label: string; href: string; end: number } | null {
  if (text[at] !== '[') return null

  const close = seek.from(text, '](', at)
  if (close === -1 || close - at > LOOK_AHEAD) return null

  const end = seek.from(text, ')', close + 2)
  if (end === -1 || end - close > LOOK_AHEAD) return null

  const href = safeHref(text.slice(close + 2, end))
  if (href === null) return null

  return { label: text.slice(at + 1, close), href, end: end + 1 }
}

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const seek = new Seek()
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

    const link = open.href === undefined ? linkAt(text, at, seek) : null
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
    if (mark && (open[mark.flag] || closes(text, at + mark.marker.length, mark.marker, seek))) {
      push()
      if (open[mark.flag]) delete open[mark.flag]
      else open[mark.flag] = true
      at += mark.marker.length - 1
      continue
    }

    if (open.href === undefined && (text[at] === 'h' || text[at] === 'w')) {
      AUTOLINK.lastIndex = at
      const bare = AUTOLINK.exec(text)
      if (bare) {
        push()
        const href = safeHref(bare[0])
        segments.push(
          href === null ? { text: bare[0], code } : { text: bare[0], code, ...open, href },
        )
        at += bare[0].length - 1
        continue
      }
    }

    buffer += text[at]
  }

  push()
  return segments
}
