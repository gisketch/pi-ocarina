/** Hint labels for leaping to a block, in the manner of vimium and flash.nvim.
 *
 *  The rule that matters is that no label is a prefix of another. With mixed
 *  lengths, typing `a` when `a` and `ab` both exist forces the reader to wait
 *  and see whether a second key is coming — so every label in one round is the
 *  same length, and the length is whatever covers the count. */

/** Home row first, then the row above: the keys a touch typist reaches
 *  without looking. Order is the priority — the nearest blocks get the
 *  shortest reach. */
export const LEAP_KEYS = 'asdfjklghqwertyuiop'

export interface LeapMatch {
  /** Index of the block whose label was typed in full. */
  hit: number | null
  /** Whether any label still starts with what has been typed. False with no
   *  hit means the reader typed something no label can complete, which is how
   *  the caller knows to give up rather than wait. */
  live: boolean
}

/** One label per block, none a prefix of another.
 *
 *  Returns fewer labels than asked for only when the key set cannot cover the
 *  count even in pairs, which is 361 blocks. A viewport does not hold that
 *  many, and a caller that somehow asks for more gets the blocks it can label
 *  rather than an exception. */
export function labelsFor(count: number): string[] {
  if (count <= 0) return []

  const keys = LEAP_KEYS.split('')
  if (count <= keys.length) return keys.slice(0, count)

  const labels: string[] = []
  for (const first of keys) {
    for (const second of keys) {
      if (labels.length === count) return labels
      labels.push(first + second)
    }
  }
  return labels
}

/** What the reader has typed so far, against the labels on screen. */
export function matchLabel(labels: string[], typed: string): LeapMatch {
  if (typed === '') return { hit: null, live: labels.length > 0 }

  const hit = labels.indexOf(typed)
  if (hit !== -1) return { hit, live: true }

  return { hit: null, live: labels.some((label) => label.startsWith(typed)) }
}
