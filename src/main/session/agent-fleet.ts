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
import type { AgentEntry, AgentRole, AgentStatus } from '../../shared/vocabulary'
import { NamePool } from './agent-names'
import { driveChild } from './agent-run'
import { SlotPool } from './agent-slots'
import { SpendBook, type Spent } from './agent-spend'
import {
  MAX_RUNNING,
  OUTPUT_CAP,
  type ChildFactory,
  type Live,
  type ParentRef,
} from './agent-types'
import type { Plan } from './spawn-plan'

export {
  MAX_PER_CALL,
  MAX_RUNNING,
  OUTPUT_CAP,
  type ChildFactory,
  type ParentRef,
} from './agent-types'

const NO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }

export class AgentFleet {
  readonly #factory: ChildFactory
  readonly #emit: EmitEvent
  /** Whether the gate stopped a call, so a child's refused call reads as
   *  `denied` rather than as a tool that broke. */
  readonly #wasBlocked: (toolCallId: string) => boolean
  readonly #names = new NamePool()
  readonly #live = new Map<string, Live>()
  readonly #slots = new SlotPool(MAX_RUNNING)
  readonly #spend = new SpendBook()
  #counter = 0

  constructor(
    factory: ChildFactory,
    emit: EmitEvent,
    wasBlocked: (toolCallId: string) => boolean = () => false,
  ) {
    this.#factory = factory
    this.#emit = emit
    this.#wasBlocked = wasBlocked
  }

  /** Children actually running, anywhere in the app.
   *
   *  Not the size of `#live`: a queued child is registered there too, so that
   *  cancelling can reach it before it ever starts. Queued is not running, and
   *  the cap is about running. */
  get liveCount(): number {
    return [...this.#live.values()].filter((live) => !live.queued).length
  }

  /** Children waiting for a slot. */
  get queuedCount(): number {
    return [...this.#live.values()].filter((live) => live.queued).length
  }

  /** What one thread's children have spent, live and settled.
   *
   *  Kept here rather than derived from the rows: the rows are the renderer's,
   *  and the figure the status bar shows has to be true in main before it is
   *  drawn anywhere. Survives a child settling; forgotten when the thread is. */
  spentIn(threadId: string): Spent {
    return this.#spend.of(threadId)
  }

  /** A thread's column has gone; its bill goes with it.
   *
   *  The thread is also marked closed, because a child still settling would
   *  otherwise charge it again a moment later and leave an entry nobody can
   *  reach or clear. Reopening clears the mark. */
  forget(threadId: string): void {
    this.#spend.forget(threadId)
  }

  /** Seeds a reopened thread with what its children spent before it closed.
   *
   *  Read back from the recorded entries, which are the same ones the rows are
   *  drawn from. Without it a thread's total fell when it was reopened, which
   *  is the fan-out looking free again — the exact reading decision 11 exists
   *  to prevent. */
  restore(threadId: string, entries: readonly AgentEntry[]): void {
    this.#spend.restore(threadId, entries)
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

    // Registered *before* the wait, not after: a child that is queued must be
    // reachable by `cancel` and by `cancelThread`, or stopping a fan-out would
    // silently leave the queued half to run — model turn, tool calls, writes
    // and all — after the reader had already stopped it. Found in review.
    let stopped = signal?.aborted === true
    const stopQueued = (): void => {
      stopped = true
    }
    this.#live.set(id, { threadId: parent.threadId, entry, stop: stopQueued, queued: true })
    if (signal && !stopped) signal.addEventListener('abort', stopQueued, { once: true })

    await this.#slots.take()
    try {
      // Whoever stopped it while it waited: the turn, the peek, or the thread
      // closing. It never becomes a session.
      if (stopped) {
        return this.#settle(parent, { ...entry, queued: undefined }, 'cancelled')
      }

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
        selfId: id,
        onWarning: (warning) => warn?.(`${plan.label}: ${warning}`),
      })

      return await this.#drive(parent, id, started, session, plan, signal)
    } catch (error) {
      return this.#settle(parent, { ...entry, queued: undefined, output: reasonOf(error) }, 'fail')
    } finally {
      this.#names.release(name)
      this.#live.delete(id)
      this.#slots.give()
    }
  }

  /** Lends this fan-out's slot back while it waits on its own children.
   *
   *  A depth-1 child that spawns is blocked, not working, and a blocked child
   *  holding a slot is what deadlocks a full cap: four spawning children would
   *  each wait for a slot none of them will release. Only a session that holds a
   *  slot gives one back — a thread does not, so its fan-out is unaffected. */
  async whileWaiting<T>(childId: string, work: () => Promise<T>): Promise<T> {
    const holds = this.#live.get(childId)?.queued === false
    return holds ? this.#slots.lend(work) : work()
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
    // The same id, now holding a stop that can actually reach a session.
    this.#live.set(id, { threadId: parent.threadId, entry, stop, queued: false })

    if (signal) {
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    }

    try {
      return await this.#turn(parent, id, entry, session, plan, () => cancelled)
    } finally {
      // pi builds one AbortController per turn, not per tool call, so a listener
      // left behind keeps every settled child of that turn reachable.
      signal?.removeEventListener('abort', stop)
    }
  }

  async #turn(
    parent: ParentRef,
    id: string,
    entry: AgentEntry,
    session: AgentSession,
    plan: Plan,
    cancelledNow: () => boolean,
  ): Promise<AgentEntry> {
    const ran = await driveChild({
      session,
      threadId: parent.threadId,
      childId: id,
      task: plan.task,
      usage: entry.usage,
      emit: this.#emit,
      wasBlocked: this.#wasBlocked,
    })
    const counted = { ...entry, usage: ran.usage }

    if (cancelledNow()) return this.#settle(parent, counted, 'cancelled')
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

  /** Stops one child. Its siblings keep running.
   *
   *  Works on a queued child as well as a running one: a queued child has no
   *  session to abort, so its stop is a flag that keeps it from ever becoming
   *  one. Without that, `x` on a queued child confirmed a destructive action
   *  and then did nothing at all. */
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
    this.#spend.charge(parent.threadId, settled.usage)

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
  wasBlocked: (toolCallId: string) => boolean = () => false,
): AgentFleet {
  const fleet = new AgentFleet(sessions, emit, wasBlocked)
  sessions.enableSpawning({
    fleet,
    // Read fresh on every call, so a role added in settings is spawnable
    // without restarting the app.
    roles: () => catalog.roles(),
    names: () => catalog.namePool(),
  })
  return fleet
}
