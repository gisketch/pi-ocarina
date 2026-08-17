/** The shapes a fan-out is described in, and the numbers that bound it.
 *
 *  Split from the fleet so the contract can be read — and imported by the tool,
 *  the factory and the tests — without pulling in the machinery that runs it. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { AgentEntry } from '../../shared/vocabulary'

/** How much of a child's final message the parent is given.
 *
 *  pi's own subagent tool caps at the same figure, for the same reason: a child
 *  that pastes a file back would put it in the parent's context, which is the
 *  cost subagents exist to avoid. */
export const OUTPUT_CAP = 50 * 1024

/** How many children run at once, anywhere in the app.
 *
 *  Counted across the whole tree rather than per parent: a per-parent cap
 *  multiplies with depth, and depth two exists precisely so the number of live
 *  sessions stays something a reader can hold in their head. Four is what one
 *  person can actually watch — eight rows updating is weather, not monitoring. */
export const MAX_RUNNING = 4

/** How many children one call may ask for. The rest of a fan-out queues; this
 *  is a bound on the *ask*, so a model cannot open eighty rows at once. */
export const MAX_PER_CALL = 8

export interface ParentRef {
  threadId: string
  workspaceId: string
  cwd: string
  /** The spawn call's own id. The child's rows nest under it. */
  toolCallId: string
  /** How deep the spawning agent is: 0 is the thread itself. A child of a
   *  child is depth 2 and gets no spawn tool of its own. */
  depth: number
}

/** What the fleet needs to build a child. Passed in rather than imported so the
 *  fleet can be tested without pi. */
export interface ChildFactory {
  child(options: {
    cwd: string
    workspaceId: string
    handle: { threadId: string }
    instructions: string
    tools: string[]
    model?: string
    /** 1 for a child of a thread, 2 for a child of a child. Decides whether it
     *  may spawn at all. */
    depth: number
    /** Whether its role allows it to spawn, if it is shallow enough. */
    spawns: boolean
    /** Who it is, so a card it raises can say who is asking. */
    agent: { name: string; role: string }
    /** Its own id, so a fan-out it starts can lend its slot back. */
    selfId: string
    onWarning?: (warning: string) => void
  }): Promise<AgentSession>
}

/** One child the fleet is holding, running or queued. */
export interface Live {
  threadId: string
  entry: AgentEntry
  stop: () => void
  /** True while the child is waiting for a slot. A queued child has no session
   *  to abort, so stopping it means never starting it. */
  queued: boolean
}
