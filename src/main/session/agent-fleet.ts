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
import type { AgentEntry, AgentStatus, AgentUsage } from '../../shared/vocabulary'
import { NamePool } from './agent-names'
import { PiTranslator } from './pi-translate'
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

  constructor(factory: ChildFactory, emit: EmitEvent) {
    this.#factory = factory
    this.#emit = emit
  }

  /** Every live child, anywhere. What the cap is measured against. */
  get liveCount(): number {
    return this.#live.size
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
      // call that is waiting on `prompt` is what reports the outcome.
      void session.abort()
    }
    this.#live.set(id, { threadId: parent.threadId, entry, stop })

    if (signal) {
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    }

    // The child's own tool calls, relayed under its row. A fresh translator per
    // child: it holds per-session state, and two children sharing one would
    // close each other's calls.
    const translator = new PiTranslator()
    let said = ''
    let broke = ''
    const unsubscribe = session.subscribe((event) => {
      for (const translated of translator.translate(event)) {
        if (translated.kind === 'tool-start') {
          this.#emit(parent.threadId, { ...translated, parentId: id })
          continue
        }
        // Rows only. A child's prose is its report, and the parent reads it as
        // the entry's output rather than as messages in the parent's transcript.
        if (ROW_EVENTS.has(translated.kind)) this.#emit(parent.threadId, translated)
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const text = textOf(event.message)
        if (text) said = text
        // A child whose model call failed says nothing at all, and an entry
        // reading `fail` with an empty output tells nobody why. pi puts the
        // reason on the message; without this it is lost and the parent model
        // retries the same broken spawn.
        const failure = (event.message as { errorMessage?: unknown }).errorMessage
        if (typeof failure === 'string' && failure !== '') broke = failure
        entry.usage = add(entry.usage, event.message.usage)
      }
    })

    try {
      await session.prompt(plan.task)
    } finally {
      unsubscribe()
    }

    if (cancelled) return this.#settle(parent, entry, 'cancelled')

    if (said === '') {
      return this.#settle(parent, { ...entry, output: broke || 'the child reported nothing' }, 'fail')
    }

    const capped = said.slice(0, OUTPUT_CAP)
    return this.#settle(
      parent,
      {
        ...entry,
        output: capped,
        ...(capped.length < said.length ? { truncated: true as const } : {}),
      },
      'ok',
    )
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

    this.#emit(parent.threadId, { kind: 'agent-update', id: entry.id, agent: settled })
    this.#emit(parent.threadId, { kind: 'tool-end', id: entry.id, status: rowStatus(status) })
    return settled
  }
}

/** What a child's own calls are allowed to put in the parent's transcript:
 *  rows, and nothing else. Its messages, its usage and its turn boundaries
 *  belong to it. */
const ROW_EVENTS = new Set(['tool-progress', 'tool-body', 'tool-end'])

/** The row's own status, which has fewer words than a child's. */
function rowStatus(status: AgentStatus): 'ok' | 'fail' | 'cancelled' | 'denied' {
  return status === 'running' ? 'ok' : status
}

function add(usage: AgentUsage, more: unknown): AgentUsage {
  const one = more as
    | { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } }
    | undefined
  if (!one) return usage

  return {
    input: usage.input + (one.input ?? 0),
    output: usage.output + (one.output ?? 0),
    cacheRead: usage.cacheRead + (one.cacheRead ?? 0),
    cacheWrite: usage.cacheWrite + (one.cacheWrite ?? 0),
    cost: usage.cost + (one.cost?.total ?? 0),
  }
}

function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter((part) => (part as { type?: string }).type === 'text')
    .map((part) => String((part as { text?: unknown }).text ?? ''))
    .join('')
    .trim()
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
