import {
  DEFAULT_PREFERENCES,
  LEADER_TIMEOUT_RANGE,
  type Preferences,
} from '../../../../shared/preferences'
import type { ReasoningLevel } from '../../../../shared/vocabulary'

export const REASONING_LEVELS: readonly ReasoningLevel[] = ['off', 'low', 'medium', 'high']

/** What the settings overlay changes.
 *
 *  Grain, motion and the leader timeout live in the catalog because losing them
 *  on relaunch would be visible. Reasoning is here too, but it is not persisted
 *  by this store: it belongs to a thread, and D5 owns where it is kept. */
class PreferencesState {
  grain = $state(DEFAULT_PREFERENCES.grain)
  motion = $state(DEFAULT_PREFERENCES.motion)
  leaderTimeoutMs = $state(DEFAULT_PREFERENCES.leaderTimeoutMs)
  reasoning = $state<ReasoningLevel>('high')

  /** The stored shape, for writing back. */
  get stored(): Preferences {
    return { grain: this.grain, motion: this.motion, leaderTimeoutMs: this.leaderTimeoutMs }
  }

  apply(preferences: Preferences): void {
    this.grain = preferences.grain
    this.motion = preferences.motion
    this.leaderTimeoutMs = preferences.leaderTimeoutMs
  }

  toggleGrain(): void {
    this.grain = !this.grain
  }

  toggleMotion(): void {
    this.motion = !this.motion
  }

  /** Steps the timeout, clamped to the range a leader chord stays usable in. */
  nudgeLeaderTimeout(direction: 1 | -1): void {
    const next = this.leaderTimeoutMs + direction * LEADER_TIMEOUT_RANGE.step
    this.leaderTimeoutMs = Math.min(
      LEADER_TIMEOUT_RANGE.max,
      Math.max(LEADER_TIMEOUT_RANGE.min, next),
    )
  }

  cycleReasoning(direction: 1 | -1): void {
    const index = REASONING_LEVELS.indexOf(this.reasoning)
    const next = Math.min(REASONING_LEVELS.length - 1, Math.max(0, index + direction))
    this.reasoning = REASONING_LEVELS[next]
  }

  get leaderTimeoutLabel(): string {
    return `${(this.leaderTimeoutMs / 1000).toFixed(1)}s`
  }
}

export const preferences = new PreferencesState()

/** Whether the app should animate at all.
 *
 *  The `motion` setting and the OS's reduce-motion preference mean the same
 *  thing to every caller, so they are combined here rather than checked in two
 *  places that could disagree. */
export function motionAllowed(): boolean {
  if (!preferences.motion) return false
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
