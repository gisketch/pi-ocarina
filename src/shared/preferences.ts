/** Settings the user chose, from the settings overlay.
 *
 *  Shared, not owned by main: the renderer reads and writes them, main stores
 *  them, and the validator is pure. Keeping them in `main/catalog.ts` would
 *  have pulled `node:fs` into the renderer bundle the moment the settings
 *  overlay imported a default. */

import { DEFAULT_PERMISSION, isPermissionLevel, type PermissionLevel } from './permissions'
import { REASONING_ORDER, type ReasoningLevel } from './vocabulary'

/** A model, named the way pi names one. Absent means pi's own choice, which is
 *  a value a reader can pick and not a gap in the settings. */
export interface ModelChoice {
  provider: string
  id: string
}

export interface Preferences {
  grain: boolean
  motion: boolean
  /** How long the leader chord waits, in milliseconds. */
  leaderTimeoutMs: number
  /** What a workspace with no permission level of its own runs at. */
  defaultPermission: PermissionLevel
  /** What a new thread opens on. Absent means pi's choice. */
  defaultModel?: ModelChoice
  /** How hard a new thread thinks. Absent means the model's own default. */
  defaultReasoning?: ReasoningLevel
  /** The voice every thread writes in, by mode id. Absent is "normal": the app
   *  appends nothing and pi behaves as it ships. */
  defaultMode?: string
  /** Whether the transcript draws what the model thought. `o` flips it, and
   *  it is remembered: a reader who does not want to watch the model think
   *  does not want to say so again every time the app starts. */
  showReasoning: boolean
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  grain: true,
  motion: true,
  leaderTimeoutMs: 2600,
  defaultPermission: DEFAULT_PERMISSION,
  showReasoning: true,
}

function parseModel(value: unknown): ModelChoice | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const provider = record.provider
  const id = record.id
  if (typeof provider !== 'string' || typeof id !== 'string') return undefined
  if (provider === '' || id === '') return undefined
  return { provider, id }
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
    showReasoning: flag('showReasoning', DEFAULT_PREFERENCES.showReasoning),
    // A level we cannot read is the default, never the most trusting one: a
    // corrupt file must not be a way to reach `full`.
    defaultPermission: isPermissionLevel(record.defaultPermission)
      ? record.defaultPermission
      : DEFAULT_PREFERENCES.defaultPermission,
    ...(parseModel(record.defaultModel) ? { defaultModel: parseModel(record.defaultModel) } : {}),
    ...(REASONING_ORDER.includes(record.defaultReasoning as ReasoningLevel)
      ? { defaultReasoning: record.defaultReasoning as ReasoningLevel }
      : {}),
    // A mode id is checked against the stored modes when it is used, not here:
    // this file cannot see them, and a pointer at a mode the reader deleted
    // resolves to no voice rather than to an error.
    ...(typeof record.defaultMode === 'string' && record.defaultMode !== ''
      ? { defaultMode: record.defaultMode }
      : {}),
  }
}
