/** Deterministic 5×5 workspace sigil.
 *
 *  Transcribed from the design reference (`px()` in PiOcarina Components.dc.html)
 *  and locked by identicon.test.ts, whose fixtures come from running that original
 *  function. The hash, the mirrored column order, and both lightness steps are part
 *  of the visual contract — changing any of them changes every workspace's identity.
 */
const CELL_COUNT = 25

const cache = new Map<string, readonly string[]>()

function hash(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 33 + ch.charCodeAt(0)) >>> 0
  return h
}

export function identicon(name: string, hue: number): readonly string[] {
  const key = `${name}:${hue}`
  const hit = cache.get(key)
  if (hit) return hit

  const h = hash(name)
  const cells: string[] = new Array(CELL_COUNT)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      // Columns mirror around the centre, so every sigil is symmetric.
      const cc = c < 3 ? c : 4 - c
      const on = (h >> ((r * 3 + cc) % 31)) & 1
      const shade = (h >> ((r * 3 + cc + 7) % 29)) & 1
      cells[r * 5 + c] = on
        ? shade
          ? `oklch(0.78 0.14 ${hue})`
          : `oklch(0.58 0.13 ${hue})`
        : 'transparent'
    }
  }

  const frozen = Object.freeze(cells) as readonly string[]
  cache.set(key, frozen)
  return frozen
}
