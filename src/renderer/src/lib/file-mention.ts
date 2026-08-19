/** Recognizing a workspace file inside backticked prose (spec D9).
 *
 *  Detection, not request: pi already writes paths in backticks, so a code
 *  span whose text resolves in the workspace's file index becomes a chip.
 *  Membership is the whole test — no path-shaped guessing — because a chip
 *  must never open onto nothing. */

export interface FileMention {
  path: string
  /** From a `path:12` (or `path:12:5`) suffix, or null. */
  line: number | null
}

const LINE_SUFFIX = /:(\d+)(?::\d+)?$/

/** The mention a code span makes, or null when it names no workspace file. */
export function asFileMention(
  code: string,
  contains: (path: string) => boolean,
): FileMention | null {
  const raw = code.trim()
  if (raw === '' || /\s/.test(raw)) return null

  const dressed = raw.startsWith('./') ? raw.slice(2) : raw
  const suffix = LINE_SUFFIX.exec(dressed)
  const bare = suffix ? dressed.slice(0, suffix.index) : dressed

  if (suffix && contains(bare)) return { path: bare, line: Number(suffix[1]) }
  // A file whose own name ends in `:digits` would be split wrongly above, so
  // the unsplit spelling gets the last word.
  if (contains(dressed)) return { path: dressed, line: null }
  return null
}
