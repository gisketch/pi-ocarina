/** Leap's arithmetic, DOM-free: where a two-character search lands, and in
 *  what order the labels go out. The extension in `leap.ts` owns the keys and
 *  the decorations; this owns the answers, so it tests headlessly. */

/** Home-row first, the way leap.nvim deals its labels: the nearer the match,
 *  the cheaper the key that names it. */
export const LEAP_LABELS = 'jfkdlsahgnuvrbytmceoxwpqz'.split('')

/** Every position in `text` (which sits at `offset` in the document) where
 *  `search` matches, nearest to `cursor` first, capped at what the label
 *  alphabet can name. Case-insensitive: a leap is aimed by eye, and the eye
 *  does not read case at a distance. Overlaps count — `aa` in `aaa` is two
 *  places the eye can land. */
export function findLeapTargets(
  text: string,
  offset: number,
  cursor: number,
  search: string,
): number[] {
  if (search.length === 0) return []
  const haystack = text.toLowerCase()
  const needle = search.toLowerCase()

  const found: number[] = []
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    found.push(offset + at)
    at = haystack.indexOf(needle, at + 1)
  }

  found.sort((a, b) => Math.abs(a - cursor) - Math.abs(b - cursor))
  return found.slice(0, LEAP_LABELS.length)
}
