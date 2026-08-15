/** Settings the user chose, from the settings overlay.
 *
 *  Shared, not owned by main: the renderer reads and writes them, main stores
 *  them, and the validator is pure. Keeping them in `main/catalog.ts` would
 *  have pulled `node:fs` into the renderer bundle the moment the settings
 *  overlay imported a default. */

export interface Preferences {
  grain: boolean
  motion: boolean
  /** How long the leader chord waits, in milliseconds. */
  leaderTimeoutMs: number
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  grain: true,
  motion: true,
  leaderTimeoutMs: 2600,
}

/** Guard rails for the leader timeout, so a corrupt file cannot leave the chord
 *  effectively instant or permanently stuck. */
export const LEADER_TIMEOUT_RANGE = { min: 800, max: 8000, step: 200 } as const

/** Reads preferences, falling back per field. A setting we cannot read is a
 *  setting the user goes back to the default for — never a broken launch. */
export function parsePreferences(value: unknown): Preferences {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_PREFERENCES }
  const record = value as Record<string, unknown>

  const flag = (key: keyof Preferences, fallback: boolean): boolean =>
    typeof record[key] === 'boolean' ? (record[key] as boolean) : fallback

  const raw = record.leaderTimeoutMs
  const timeout =
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(LEADER_TIMEOUT_RANGE.max, Math.max(LEADER_TIMEOUT_RANGE.min, Math.round(raw)))
      : DEFAULT_PREFERENCES.leaderTimeoutMs

  return {
    grain: flag('grain', DEFAULT_PREFERENCES.grain),
    motion: flag('motion', DEFAULT_PREFERENCES.motion),
    leaderTimeoutMs: timeout,
  }
}
