/** One follow state per thread column.
 *
 *  Per column because each thread is a place the reader can be: pausing to
 *  read one thread's history must not stop another from following its own
 *  stream. Held here rather than in the component because two other things
 *  need to reach it — the `G` key, which has no component, and the status bar,
 *  which is not inside any column.
 *
 *  The scrolling itself stays in the component. This owns the decision, never
 *  the element. */

import { Follow } from '../follow.svelte'
import { columnBody, smoothScrollAiming } from './columns'

class Followers {
  #per = new Map<string, Follow>()

  of(threadId: string): Follow {
    let follow = this.#per.get(threadId)
    if (!follow) {
      follow = new Follow()
      this.#per.set(threadId, follow)
    }
    return follow
  }

  /** Back to the newest content, and pinned there. Called by the pill, by the
   *  key, and by sending a message.
   *
   *  Aimed at the bottom rather than at a number: the transcript measures its
   *  blocks as they scroll past, so the bottom moves while the jump travels,
   *  and a jump that landed on the old one stopped short of the newest thing —
   *  which is the only thing a jump is for. The scroll re-aims each frame and
   *  writes the position straight if no frame arrives, so a busy or occluded
   *  window cannot lose it. */
  jump(threadId: string): void {
    this.of(threadId).jump()
    const body = columnBody(threadId)
    if (!body) return
    smoothScrollAiming(body, () => body.scrollHeight - body.clientHeight)
  }

  /** Called when a column goes away, the way the other per-thread registries
   *  are, so a closed thread does not keep its state forever. */
  forget(threadId: string): void {
    this.#per.delete(threadId)
  }
}

export const following = new Followers()
