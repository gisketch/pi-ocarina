/** The fan-out: several children at once, what they cost, and stopping them.
 *
 *  Split from `agent-fleet.test.ts`, which covers one child end to end. These
 *  are the properties that only exist once there is more than one — the cap,
 *  the queue, the names, the bill, and cancelling one without the others. */

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
  const factory: ChildFactory = { child: async () => session as never }
  return { fleet: new AgentFleet(factory, (id, event) => events.push([id, event])), events }
}

const plan = (label = 'find retry') =>
  planSpawn({ role: 'scout', task: 'find it', label }, DEFAULT_ROLES)


describe('several at once', () => {
  it('runs no more than the cap, and queues the rest', async () => {
    const started: string[] = []
    const releases: (() => void)[] = []
    const factory: ChildFactory = {
      child: async (options) => {
        started.push(options.instructions)
        return {
          subscribe: () => () => {},
          prompt: () => new Promise<void>((resolve) => releases.push(resolve)),
          abort: async () => {},
        } as never
      },
    }
    const fleet = new AgentFleet(factory, () => {})

    const runs = Array.from({ length: 6 }, () =>
      fleet.run(PARENT, plan(), POOL, undefined),
    )
    await vi.waitFor(() => expect(started).toHaveLength(MAX_RUNNING))

    // The cap holds while the first four are still in flight.
    expect(fleet.liveCount).toBe(MAX_RUNNING)
    releases.shift()?.()
    await vi.waitFor(() => expect(started).toHaveLength(MAX_RUNNING + 1))

    for (const release of [...releases]) release()
    await vi.waitFor(() => expect(started).toHaveLength(6), { timeout: 3000 })
    for (const release of [...releases]) release()
    await Promise.all(runs)
  })

  it('gives every child alive at once a different name', async () => {
    const names: string[] = []
    const releases: (() => void)[] = []
    const factory: ChildFactory = {
      child: async () =>
        ({
          subscribe: () => () => {},
          prompt: () => new Promise<void>((resolve) => releases.push(resolve)),
          abort: async () => {},
        }) as never,
    }
    const fleet = new AgentFleet(factory, (_id, event) => {
      if (event.kind === 'tool-start' && event.agent) names.push(event.agent.name)
    })

    const runs = Array.from({ length: 3 }, () => fleet.run(PARENT, plan(), POOL, undefined))
    await vi.waitFor(() => expect(releases).toHaveLength(3))

    expect(new Set(names).size).toBe(3)
    for (const release of releases) release()
    await Promise.all(runs)
  })

  it('opens a queued child’s row immediately, marked as waiting', async () => {
    const events: [string, UiEvent][] = []
    const releases: (() => void)[] = []
    const factory: ChildFactory = {
      child: async () =>
        ({
          subscribe: () => () => {},
          prompt: () => new Promise<void>((resolve) => releases.push(resolve)),
          abort: async () => {},
        }) as never,
    }
    const fleet = new AgentFleet(factory, (id, event) => events.push([id, event]))

    const runs = Array.from({ length: 5 }, () => fleet.run(PARENT, plan(), POOL, undefined))
    await vi.waitFor(() => expect(releases).toHaveLength(MAX_RUNNING))

    const opened = events.filter(([, event]) => event.kind === 'tool-start')
    expect(opened).toHaveLength(5)
    // Every row opens marked as waiting — four rows and one missing would read
    // as a fan-out that lost one.
    expect(
      opened.every(([, event]) => event.kind === 'tool-start' && event.agent?.queued === true),
    ).toBe(true)
    // Four have been told they started; the fifth is still queued.
    const running = events.filter(
      ([, event]) => event.kind === 'agent-update' && event.agent.queued === undefined,
    )
    expect(running).toHaveLength(MAX_RUNNING)

    for (const release of releases) release()
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(MAX_RUNNING))
    for (const release of releases) release()
    await Promise.all(runs)
  })

  it('passes the child its own depth, so a grandchild cannot spawn', async () => {
    const depths: number[] = []
    const factory: ChildFactory = {
      child: async (options) => {
        depths.push(options.depth)
        return {
          subscribe: () => () => {},
          prompt: async () => {},
          abort: async () => {},
        } as never
      },
    }
    const fleet = new AgentFleet(factory, () => {})

    await fleet.run(PARENT, plan(), POOL, undefined)
    await fleet.run({ ...PARENT, depth: 1 }, plan(), POOL, undefined)
    expect(depths).toEqual([1, 2])
  })
})

describe('what the children cost the thread', () => {
  it('adds a settled child’s tokens to its thread’s bill', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)

    expect(fleet.spentIn('t1')).toEqual({ tokens: 0, costUsd: 0 })
    await fleet.run(PARENT, plan(), POOL, undefined)

    expect(fleet.spentIn('t1')).toEqual({ tokens: 14, costUsd: 0.001 })
  })

  it('charges for a child that failed, because the tokens were still spent', async () => {
    const { session } = fakeSession({ says: '' })
    const { fleet } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)
    expect(fleet.spentIn('t1').tokens).toBe(14)
  })

  it('keeps threads’ bills apart', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)
    await fleet.run({ ...PARENT, threadId: 't2' }, plan(), POOL, undefined)

    expect(fleet.spentIn('t1').tokens).toBe(14)
    expect(fleet.spentIn('t2').tokens).toBe(14)
  })

  it('forgets a thread whose column has gone', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)
    fleet.forget('t1')
    expect(fleet.spentIn('t1')).toEqual({ tokens: 0, costUsd: 0 })
  })
})
