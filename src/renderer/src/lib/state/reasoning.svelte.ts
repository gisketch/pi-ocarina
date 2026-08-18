/** Whether the transcript draws what the model thought.
 *
 *  Only that. A thought is a row of the ledger now, so whether one is expanded
 *  is `toolOpen`'s business like every other row's — this used to keep a second
 *  expansion store beside it, which is exactly the parallel path that let the
 *  two disagree.
 *
 *  Kept in preferences because it is remembered: a reader who does not want to
 *  watch the model think should not have to say so again every time the app
 *  starts. */

import { preferences } from './preferences.svelte'

class Reasoning {
  get shown(): boolean {
    return preferences.showReasoning
  }

  /** `o`. Shows or hides every thought in the app.
   *
   *  Hiding rather than collapsing: a reader who does not care what the model
   *  thought does not want a row per thought either, and a key that only
   *  collapsed them would leave the transcript exactly as cluttered. */
  toggleAll(): void {
    preferences.showReasoning = !preferences.showReasoning
  }
}

export const reasoningOpen = new Reasoning()
