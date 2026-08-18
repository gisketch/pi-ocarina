import type { PermissionLevel } from '../../../../shared/permissions'
import type { ModelChoice } from '../../../../shared/preferences'
import type { ReasoningLevel } from '../../../../shared/vocabulary'
import { REASONING_ORDER } from '../../../../shared/vocabulary'
import {
  DEFAULT_PREFERENCES,
  LEADER_TIMEOUT_RANGE,
  type Preferences,
} from '../../../../shared/preferences'
/** What the settings overlay changes.
 *
 *  Grain, motion and the leader timeout, all in the catalog because losing them
 *  on relaunch would be visible. Reasoning is deliberately absent: it belongs
 *  to a thread and pi stores it in the session file, so a copy here would be a
 *  second answer that could disagree. */
class PreferencesState {
  grain = $state(DEFAULT_PREFERENCES.grain)
  motion = $state(DEFAULT_PREFERENCES.motion)
  leaderTimeoutMs = $state(DEFAULT_PREFERENCES.leaderTimeoutMs)
  /** What a workspace with no level of its own runs at. Held here because the
   *  settings screen sets it; main is still the only thing that enforces it. */
  defaultPermission = $state<PermissionLevel>(DEFAULT_PREFERENCES.defaultPermission)
  /** What a new thread opens on. Absent means pi's choice, which is a value the
   *  reader can pick rather than a gap. */
  defaultModel = $state<ModelChoice | undefined>(undefined)
  defaultReasoning = $state<ReasoningLevel | undefined>(undefined)
  /** Whether the transcript draws what the model thought. `o` flips it. */
  showReasoning = $state(DEFAULT_PREFERENCES.showReasoning)

  /** The stored shape, for writing back. */
  get stored(): Preferences {
    return {
      grain: this.grain,
      motion: this.motion,
      leaderTimeoutMs: this.leaderTimeoutMs,
      defaultPermission: this.defaultPermission,
      showReasoning: this.showReasoning,
      ...(this.defaultModel ? { defaultModel: this.defaultModel } : {}),
      ...(this.defaultReasoning ? { defaultReasoning: this.defaultReasoning } : {}),
    }
  }

  apply(preferences: Preferences): void {
    this.grain = preferences.grain
    this.motion = preferences.motion
    this.leaderTimeoutMs = preferences.leaderTimeoutMs
    this.defaultPermission = preferences.defaultPermission
    this.defaultModel = preferences.defaultModel
    this.defaultReasoning = preferences.defaultReasoning
    this.showReasoning = preferences.showReasoning
  }

  /** The label the settings row shows for the default model. */
  get defaultModelLabel(): string {
    return this.defaultModel ? this.defaultModel.id : "pi's choice"
  }

  get defaultReasoningLabel(): string {
    return this.defaultReasoning ?? 'model default'
  }

  /** Records what a new thread should open on.
   *
   *  A null reasoning level means the model cannot reason, so there is nothing
   *  to store — not that the reader wants the model's default. */
  setDefaultModel(model: { provider: string; id: string }, reasoning: ReasoningLevel | null): void {
    this.defaultModel = { provider: model.provider, id: model.id }
    if (reasoning) this.defaultReasoning = reasoning
  }

  /** Steps the default reasoning level, starting from the model's own default
   *  the first time. Walks off the end into "model default" rather than
   *  sticking, so a reader can undo the choice with the same key. */
  nudgeDefaultReasoning(direction: 1 | -1): void {
    if (this.defaultReasoning === undefined) {
      this.defaultReasoning = direction === 1 ? REASONING_ORDER[0] : REASONING_ORDER.at(-1)
      return
    }

    const next = REASONING_ORDER.indexOf(this.defaultReasoning) + direction
    this.defaultReasoning = REASONING_ORDER[next]
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
