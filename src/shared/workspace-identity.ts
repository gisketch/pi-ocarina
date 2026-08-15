/** Gives a pinned folder its voice: a name, an ocarina note, and an accent hue.
 *
 *  Derived from the path so a folder looks the same on every machine and every
 *  relaunch, and so two folders side by side are unlikely to share a colour.
 *  The design's own workspaces sit in this table (D/152, F♯/265, A/45). */

export interface WorkspaceVoice {
  note: string
  hue: number
}

/** One per hole on the ocarina, spread around the hue circle. */
const VOICES: readonly WorkspaceVoice[] = [
  { note: 'D', hue: 152 },
  { note: 'F♯', hue: 265 },
  { note: 'A', hue: 45 },
  { note: 'C', hue: 95 },
  { note: 'E', hue: 196 },
  { note: 'G', hue: 310 },
  { note: 'B', hue: 20 },
  { note: 'F', hue: 232 },
]

/** The same hash the identicons use, so a folder's sigil and colour agree. */
export function hashPath(path: string): number {
  let hash = 0
  for (const character of path) hash = (hash * 33 + character.charCodeAt(0)) >>> 0
  return hash
}

export function voiceFor(path: string): WorkspaceVoice {
  return VOICES[hashPath(path) % VOICES.length]
}

/** The folder's own name, which is what the user calls it. */
export function nameFor(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.at(-1) ?? path
}
