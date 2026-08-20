/** Stopping children, and what a fan-out costs.
 *
 *  Split from `agent-fleet-many.test.ts`, which covers the cap, the queue and
 *  the names. These are the two properties the review found could be deleted
 *  without a test noticing. */

import { describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { DEFAULT_ROLES } from '../../shared/agent-roles'
import {
  AgentFleet,
  MAX_RUNNING,
  OUTPUT_CAP,
  type ChildFactory,
  type ParentRef,
} from './agent-fleet'
import { planSpawn } from './spawn-plan'

const PARENT: ParentRef = {
  threadId: 't1',
  workspaceId: 'w1',
  cwd: '/repo',
  toolCallId: 'spawn-1',
  depth: 0,
}
const POOL = ['odysseus', 'circe', 'zeus']

function fakeSession(options: {
  says?: string
  calls?: string[]
  hang?: boolean
  errorMessage?: string
  usage?: Record<string, unknown>
}): { session: any; finish: () => void } {
  const listeners: ((event: unknown) => void)[] = []
  let release: (() => void) | undefined

  const session = {
    subscribe(listener: (event: unknown) => void) {
      listeners.push(listener)
      return () => listeners.splice(listeners.indexOf(listener), 1)
    },
    async prompt() {
      for (const id of options.calls ?? []) {
        emit({ type: 'tool_execution_start', toolCallId: id, toolName: 'read', args: { file_path: 'a.ts' } })
        emit({ type: 'tool_execution_end', toolCallId: id, toolName: 'read', result: {}, isError: false })
      }
      emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: options.says ?? 'done' }],
          usage: options.usage ?? { input: 10, output: 4, cost: { total: 0.001 } },
          ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
        },
      })
      if (options.hang) await new Promise<void>((resolve) => (release = resolve))
    },
    async abort() {
      release?.()
    },
  }

  function emit(event: unknown): void {
    for (const listener of [...listeners]) listener(event)
  }

  return { session, finish: () => release?.() }
}

function fleetWith(session: unknown): { fleet: AgentFleet; events: [string, UiEvent][] } {
  const events: [string, UiEvent][] = []
  const factory: ChildFactory = { child: async () => ({ session }) as never }
  return { fleet: new AgentFleet(factory, (id, event) => events.push([id, event])), events }
}

const plan = (label = 'find retry') =>
  planSpawn({ role: 'scout', task: 'find it', label }, DEFAULT_ROLES)



describe('stopping one child out of several', () => {
  /** Three children that hang until released, so all three are live at once. */
  function hanging(): {
    fleet: AgentFleet
    events: [string, UiEvent][]
    releases: (() => void)[]
  } {
    const releases: (() => void)[] = []
    const events: [string, UiEvent][] = []
    const factory: ChildFactory = {
      // Each child holds its own release, so aborting one does not free another
      // — which is the whole thing these tests are about.
      child: async () => {
        let release: (() => void) | undefined
        const session = {
          subscribe: () => () => {},
          prompt: () =>
            new Promise<void>((resolve) => {
              release = resolve
              releases.push(resolve)
            }),
          abort: async () => release?.(),
        }
        return { session } as never
      },
    }
    return { fleet: new AgentFleet(factory, (id, event) => events.push([id, event])), events, releases }
  }

  it('cancels the one named and leaves its siblings running', async () => {
    const { fleet, events, releases } = hanging()
    const runs = [
      fleet.run(PARENT, plan('a'), POOL, undefined),
      fleet.run(PARENT, plan('b'), POOL, undefined),
      fleet.run(PARENT, plan('c'), POOL, undefined),
    ]
    await vi.waitFor(() => expect(fleet.liveCount).toBe(3))

    const opened = events
      .filter(([, event]) => event.kind === 'tool-start' && event.agent)
      .map(([, event]) => (event.kind === 'tool-start' ? event.agent! : null))
    const second = opened[1]!

    expect(fleet.cancel(second.id)).toBe(true)
    const settled = await runs[1]

    expect(settled.status).toBe('cancelled')
    expect(settled.output).toBeUndefined()
    // The other two are still going.
    expect(fleet.liveCount).toBe(2)

    for (const release of [...releases]) release()
    await Promise.all(runs)
  })

  it('cancels a child that has not started yet, rather than confirming and doing nothing', async () => {
    const { fleet, events, releases } = hanging()
    const runs = Array.from({ length: MAX_RUNNING + 1 }, (_, at) =>
      fleet.run(PARENT, plan(`t${at}`), POOL, undefined),
    )
    await vi.waitFor(() => expect(fleet.queuedCount).toBe(1))

    const opened = events
      .filter(([, event]) => event.kind === 'tool-start' && event.agent)
      .map(([, event]) => (event.kind === 'tool-start' ? event.agent! : null))
    const queued = opened.at(-1)!

    expect(fleet.cancel(queued.id)).toBe(true)
    for (const release of [...releases]) release()

    const settled = await runs[MAX_RUNNING]
    expect(settled.status).toBe('cancelled')
    // And it never became a session: nothing was prompted for it.
    expect(settled.output).toBeUndefined()
    await Promise.all(runs)
  })

  it('never starts a queued child whose turn was cancelled while it waited', async () => {
    const started: string[] = []
    const releases: (() => void)[] = []
    const factory: ChildFactory = {
      child: async (options) => {
        started.push(options.instructions)
        return {
          session: {
            subscribe: () => () => {},
            prompt: () => new Promise<void>((resolve) => releases.push(resolve)),
            abort: async () => releases.shift()?.(),
          },
        } as never
      },
    }
    const fleet = new AgentFleet(factory, () => {})
    const controller = new AbortController()

    const runs = Array.from({ length: MAX_RUNNING + 2 }, () =>
      fleet.run(PARENT, plan(), POOL, controller.signal),
    )
    await vi.waitFor(() => expect(started).toHaveLength(MAX_RUNNING))

    controller.abort()
    for (const release of [...releases]) release()
    const settled = await Promise.all(runs)

    // The queued two never became sessions — no model turn, no tool calls, no
    // writes after the reader had already stopped it.
    expect(started).toHaveLength(MAX_RUNNING)
    expect(settled.slice(MAX_RUNNING).every((entry) => entry.status === 'cancelled')).toBe(true)
  })
})

describe('a child that says more than the parent can hold', () => {
  it('caps the output and says it was cut', async () => {
    const { session } = fakeSession({ says: 'x'.repeat(OUTPUT_CAP + 100) })
    const { fleet } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)
    expect(entry.output).toHaveLength(OUTPUT_CAP)
    expect(entry.truncated).toBe(true)
  })

  it('says nothing about truncation when it fits exactly', async () => {
    const { session } = fakeSession({ says: 'x'.repeat(OUTPUT_CAP) })
    const { fleet } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)
    expect(entry.truncated).toBeUndefined()
  })
})

describe('what a fan-out costs', () => {
  it('counts cached tokens, which are most of a read-heavy child', async () => {
    // pi's own total is all four buckets. Counting only input and output made a
    // scout that read widely report a fraction of what it spent.
    const { session } = fakeSession({
      usage: { input: 1_000, output: 10, cacheRead: 90_000, cacheWrite: 5_000, cost: { total: 0.1 } },
    })
    const { fleet } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)
    expect(fleet.spentIn('t1').tokens).toBe(96_010)
  })

  it('puts a reopened thread’s children back on its bill', async () => {
    const { fleet } = fleetWith(fakeSession({}).session)
    fleet.restore('t1', [
      {
        id: 'c1',
        name: 'circe',
        role: 'scout',
        label: 'x',
        status: 'ok',
        usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 0, cost: 0.02 },
        startedAt: 0,
      },
    ])

    expect(fleet.spentIn('t1')).toEqual({ tokens: 115, costUsd: 0.02 })
  })
})
