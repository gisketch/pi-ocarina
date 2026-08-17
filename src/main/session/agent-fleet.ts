/** Children, while they run.
 *
 *  One fleet per app. It owns every live child in every thread, because the cap
 *  counts the whole tree rather than each parent's own children — a cap that
 *  counted per parent would multiply with depth, which is the thing depth two
 *  was chosen not to do.
 *
 *  A child is an in-process session with no file. Its tool calls are relayed
 *  into the parent's thread stamped with the spawn call's id, which is what puts
 *  them under the row that started them. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { EmitEvent } from '../../shared/protocol'
import type { AgentEntry, AgentRole, AgentStatus, AgentUsage } from '../../shared/vocabulary'
import { NamePool } from './agent-names'
import { driveChild } from './agent-run'
import type { Plan } from './spawn-plan'

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
    onWarning?: (warning: string) => void
  }): Promise<AgentSession>
}

interface Live {
  threadId: string
  entry: AgentEntry
  stop: () => void
}

const NO_USAGE: AgentUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }

export class AgentFleet {
  readonly #factory: ChildFactory
  readonly #emit: EmitEvent
  readonly #names = new NamePool()
  readonly #live = new Map<string, Live>()
  /** Callers waiting for a slot under the running cap, oldest first. */
  readonly #waiting: (() => void)[] = []
  #running = 0
  #counter = 0
  /** Thread id → what its children have cost, ever. */
  readonly #spent = new Map<string, { tokens: number; costUsd: number }>()

  constructor(factory: ChildFactory, emit: EmitEvent) {
    this.#factory = factory
    this.#emit = emit
  }

  /** Every live child, anywhere. What the cap is measured against. */
  get liveCount(): number {
    return this.#live.size
  }

  /** What one thread's children have spent, live and settled.
   *
   *  Kept here rather than derived from the rows: the rows are the renderer's,
   *  and the figure the status bar shows has to be true in main before it is
   *  drawn anywhere. Survives a child settling; forgotten when the thread is. */
  spentIn(threadId: string): { tokens: number; costUsd: number } {
    return this.#spent.get(threadId) ?? { tokens: 0, costUsd: 0 }
  }

  /** A thread's column has gone; its bill goes with it. */
  forget(threadId: string): void {
    this.#spent.delete(threadId)
  }

  /** Runs one child to completion and returns what the parent should read.
   *
   *  Never throws: a child that could not start is an entry with status `fail`
   *  and the reason as its output. A tool that throws teaches the model the tool
   *  is broken, when what actually happened is that one of several children did
   *  not run. */
  async run(
    parent: ParentRef,
    plan: Plan,
    pool: readonly string[],
    signal: AbortSignal | undefined,
    warn?: (warning: string) => void,
  ): Promise<AgentEntry> {
    this.#counter += 1
    const id = `${parent.toolCallId}-child-${this.#counter}`
    const name = this.#names.draw(pool)

    const entry: AgentEntry = {
      id,
      name,
      role: plan.role,
      label: plan.label,
      status: 'running',
      queued: true,
      usage: { ...NO_USAGE },
      startedAt: Date.now(),
    }

    // The row exists before the session does, so a child that fails to start
    // still has somewhere to say so.
    this.#emit(parent.threadId, {
      kind: 'tool-start',
      id,
      tool: 'agent',
      target: plan.label,
      parentId: parent.toolCallId,
      agent: entry,
    })

    await this.#slot()
    try {
      // The clock starts when it starts, not when it was asked for: a child
      // that waited two minutes for a slot did not take two minutes to work.
      const started: AgentEntry = { ...entry, queued: undefined, startedAt: Date.now() }
      this.#emit(parent.threadId, { kind: 'agent-update', id, agent: started })

      const session = await this.#factory.child({
        cwd: parent.cwd,
        workspaceId: parent.workspaceId,
        handle: { threadId: parent.threadId },
        instructions: plan.instructions,
        tools: plan.tools,
        model: plan.model,
        depth: parent.depth + 1,
        spawns: plan.spawns,
        agent: { name, role: plan.role },
        onWarning: (warning) => warn?.(`${plan.label}: ${warning}`),
      })

      return await this.#drive(parent, id, started, session, plan, signal)
    } catch (error) {
      return this.#settle(parent, { ...entry, queued: undefined, output: reasonOf(error) }, 'fail')
    } finally {
      this.#names.release(name)
      this.#live.delete(id)
      this.#free()
    }
  }

  /** Waits for a slot under the running cap. */
  #slot(): Promise<void> {
    if (this.#running < MAX_RUNNING) {
      this.#running += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => this.#waiting.push(resolve))
  }

  /** Hands the slot to whoever has been waiting longest. */
  #free(): void {
    const next = this.#waiting.shift()
    if (next) next()
    else this.#running -= 1
  }

  /** Stops one child. Its siblings keep running. */
  cancel(childId: string): boolean {
    const live = this.#live.get(childId)
    if (!live) return false

    live.stop()
    return true
  }

  /** Stops every child of one thread — the turn ended, or the thread closed.
   *
   *  Matched on the thread each child was started for, not on its id: a child's
   *  id is built from the spawn call, which says nothing about which thread the
   *  call was in. */
  cancelThread(threadId: string): void {
    for (const live of [...this.#live.values()]) {
      if (live.threadId === threadId) live.stop()
    }
  }

  async #drive(
    parent: ParentRef,
    id: string,
    entry: AgentEntry,
    session: AgentSession,
    plan: Plan,
    signal: AbortSignal | undefined,
  ): Promise<AgentEntry> {
    let cancelled = false
    const stop = (): void => {
      cancelled = true
      // Fire and forget: `abort` resolves when the session has stopped, and the
      // call that is waiting on the turn is what reports the outcome.
      void session.abort()
    }
    this.#live.set(id, { threadId: parent.threadId, entry, stop })

    if (signal) {
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    }

    const ran = await driveChild({
      session,
      threadId: parent.threadId,
      childId: id,
      task: plan.task,
      usage: entry.usage,
      emit: this.#emit,
    })
    const counted = { ...entry, usage: ran.usage }

    if (cancelled) return this.#settle(parent, counted, 'cancelled')
    if (ran.said === '') {
      const why = ran.broke || 'the child reported nothing'
      return this.#settle(parent, { ...counted, output: why }, 'fail')
    }

    const capped = ran.said.slice(0, OUTPUT_CAP)
    return this.#settle(
      parent,
      {
        ...counted,
        output: capped,
        ...(capped.length < ran.said.length ? { truncated: true as const } : {}),
      },
      'ok',
    )
  }

  /** Adds a child's bill to its thread's. */
  #charge(threadId: string, usage: AgentUsage): void {
    const held = this.#spent.get(threadId) ?? { tokens: 0, costUsd: 0 }
    this.#spent.set(threadId, {
      tokens: held.tokens + usage.input + usage.output,
      costUsd: held.costUsd + usage.cost,
    })
  }

  #settle(parent: ParentRef, entry: AgentEntry, status: AgentStatus): AgentEntry {
    // A cancelled child reports nothing: a half-finished report read as a
    // finished one is the failure mode this avoids.
    const settled: AgentEntry = {
      ...entry,
      status,
      endedAt: Date.now(),
      ...(status === 'cancelled' ? { output: undefined } : {}),
    }

    // Charged even when it was cancelled or failed: the tokens were spent.
    this.#charge(parent.threadId, settled.usage)

    this.#emit(parent.threadId, { kind: 'agent-update', id: entry.id, agent: settled })
    this.#emit(parent.threadId, { kind: 'tool-end', id: entry.id, status: rowStatus(status) })
    return settled
  }
}

/** The row's own status, which has fewer words than a child's. */
function rowStatus(status: AgentStatus): 'ok' | 'fail' | 'cancelled' | 'denied' {
  return status === 'running' ? 'ok' : status
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Builds a fleet and hands it back to the factory that will build its children.
 *
 *  A child is a session and a session may spawn children, so the two are
 *  mutually dependent and one of them has to be wired after construction. Here
 *  rather than in the driver's constructor, which is already a list of six
 *  things being stood up in order. */
export function fleetFor(
  sessions: ChildFactory & {
    enableSpawning: (deps: {
      fleet: AgentFleet
      roles: () => AgentRole[]
      names: () => string[]
    }) => void
  },
  emit: EmitEvent,
  catalog: { roles: () => AgentRole[]; namePool: () => string[] },
): AgentFleet {
  const fleet = new AgentFleet(sessions, emit)
  sessions.enableSpawning({
    fleet,
    // Read fresh on every call, so a role added in settings is spawnable
    // without restarting the app.
    roles: () => catalog.roles(),
    names: () => catalog.namePool(),
  })
  return fleet
}
