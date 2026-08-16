/** Finding the words a reader can see, and naming them in one keystroke.
 *
 *  The model is leap.nvim's: type the two characters you are looking at, then
 *  the label that appears on the one you meant. What differs is the
 *  destination — this app has no text cursor, so a leap lands on the block
 *  holding the match rather than on the character itself.
 *
 *  Everything here is pure. The walk over text nodes and the painting of
 *  matches live in the state module; this file only answers "where, and what
 *  is it called". */

/** leap.nvim's own order, kept because it is chosen for home-row reach: the
 *  nearest match gets the shortest journey for the hand. */
export const LEAP_LABELS = 'sfnjklhodweimbuyvrgtaqpcxz'

/** How many characters the reader types before labels appear. */
export const PATTERN_LENGTH = 2

/** Smartcase, by the convention every editor already taught: an all-lowercase
 *  pattern matches any case, and one capital makes the whole thing exact. */
export function isCaseSensitive(pattern: string): boolean {
  return pattern !== pattern.toLowerCase()
}

/** Every offset in `text` where `pattern` begins.
 *
 *  Overlapping matches count: searching `aa` against `aaa` finds two, because
 *  they are two places the reader can see and so two places they can mean. */
export function findMatches(text: string, pattern: string): number[] {
  if (pattern === '') return []

  const exact = isCaseSensitive(pattern)
  const haystack = exact ? text : text.toLowerCase()
  const needle = exact ? pattern : pattern.toLowerCase()

  const found: number[] = []
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    found.push(at)
    at = haystack.indexOf(needle, at + 1)
  }
  return found
}

/** How many pages a set of matches needs. Zero matches is zero pages. */
export function groupCount(total: number): number {
  return Math.ceil(total / LEAP_LABELS.length)
}

/** Keeps a page number inside the pages that exist, wrapping at both ends so
 *  `space` past the last group returns to the first rather than sticking. */
export function wrapGroup(group: number, total: number): number {
  const pages = groupCount(total)
  if (pages <= 1) return 0
  return ((group % pages) + pages) % pages
}

/** The label on a match, or null when the match is on another page.
 *
 *  Labels are reused per page rather than growing to two characters: a leap is
 *  three keystrokes, and a fourth would defeat the whole point of it. */
export function labelAt(index: number, group: number): string | null {
  const size = LEAP_LABELS.length
  const page = Math.floor(index / size)
  if (page !== group) return null
  return LEAP_LABELS[index % size] ?? null
}

/** Which match a typed label means on the page being shown. Null when the key
 *  is not a label on this page — which is how the caller knows to give up
 *  rather than guess. */
export function matchForLabel(key: string, group: number, total: number): number | null {
  const at = LEAP_LABELS.indexOf(key)
  if (at === -1) return null

  const index = group * LEAP_LABELS.length + at
  return index < total ? index : null
}
