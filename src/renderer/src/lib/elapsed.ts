/** How long something took, said the way a person would.
 *
 *  Rounded down, never up: a turn that has run for 3.9 seconds has not taken
 *  four, and a counter that reached a number before the thing did would be the
 *  one place in the app that reports the future.
 *
 *  Past a minute the seconds are padded, so the text stops changing width and
 *  a footer counting through `1m09s` to `1m10s` does not shift under the eye.
 *  Past an hour the seconds go: nobody reads the units of an hour-long turn,
 *  and the width is better spent. */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms))

  if (total < MINUTE) return `${Math.floor(total / SECOND)}s`

  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE)
    const seconds = Math.floor((total % MINUTE) / SECOND)
    return `${minutes}m${String(seconds).padStart(2, '0')}s`
  }

  const hours = Math.floor(total / HOUR)
  const minutes = Math.floor((total % HOUR) / MINUTE)
  return `${hours}h${String(minutes).padStart(2, '0')}m`
}
