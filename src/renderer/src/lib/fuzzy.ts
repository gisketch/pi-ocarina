/** One matcher for every filtered list in the app.
 *
 *  The palette, the workspace switcher and the model selector all use the
 *  design's detached-input pattern, and a user who learns how filtering behaves
 *  in one of them has learned all three. Two matchers would be two behaviours. */

/** Subsequence match, case-insensitive: "ntc" finds "New Thread in this workspaCe".
 *  Returns null when the query does not match at all. Lower score sorts first. */
export function fuzzyScore(text: string, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (q === '') return 0
  const haystack = text.toLowerCase()

  let index = 0
  let score = 0
  let previous = -1
  for (const ch of q) {
    const found = haystack.indexOf(ch, index)
    if (found === -1) return null
    // Prefer matches that are contiguous and start on a word boundary.
    const gap = previous === -1 ? found : found - previous - 1
    score += gap
    previous = found
    index = found + 1
  }
  return score
}

/** Keeps the items whose `text` matches, best first. Ties keep their original
 *  order, so an empty query leaves a list exactly as it was written. */
export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(text(item), query) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item)
}

/** Wraps an index into a list, so arrow keys cycle at both ends. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}
