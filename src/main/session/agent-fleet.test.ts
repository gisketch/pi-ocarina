import { describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { DEFAULT_ROLES } from '../../shared/agent-roles'
import { AgentFleet, MAX_RUNNING, type ChildFactory, type ParentRef } from './agent-fleet'
import { planSpawn } from './spawn-plan'

const PARENT: ParentRef = {
  threadId: 't1',
  workspaceId: 'w1',
  cwd: '/repo',
  toolCallId: 'spawn-1',
  depth: 0,
}
const POOL = ['odysseus', 'circe', 'zeus']

/** A session that says one thing and stops. Enough to drive the fleet without
 *  pi: the fleet only ever subscribes, prompts and aborts. */
function fakeSession(options: {
  says?: string
  calls?: string[]
  hang?: boolean
  errorMessage?: string
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
          usage: { input: 10, output: 4, cost: { total: 0.001 } },
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

describe('running one child', () => {
  it('opens its row before the session exists, so a failure has somewhere to land', async () => {
    const factory: ChildFactory = {
      child: async () => {
        throw new Error('no model configured')
      },
    }
    const events: [string, UiEvent][] = []
    const fleet = new AgentFleet(factory, (id, event) => events.push([id, event]))

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)

    expect(events[0][1]).toMatchObject({ kind: 'tool-start', parentId: 'spawn-1', tool: 'agent' })
    expect(entry.status).toBe('fail')
    expect(entry.output).toBe('no model configured')
  })

  it('reports the final message as the output, and counts what it cost', async () => {
    const { session } = fakeSession({ says: 'seven callers, all in src/sync' })
    const { fleet } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)

    expect(entry.status).toBe('ok')
    expect(entry.output).toBe('seven callers, all in src/sync')
    expect(entry.usage).toMatchObject({ input: 10, output: 4, cost: 0.001 })
    expect(entry.endedAt).toBeGreaterThanOrEqual(entry.startedAt)
  })

  it('nests the child’s own tool calls under the child, not under the spawn', async () => {
    const { session } = fakeSession({ calls: ['r1'] })
    const { fleet, events } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)

    const started = events.filter(([, event]) => event.kind === 'tool-start')
    expect(started).toHaveLength(2)
    expect(started[1][1]).toMatchObject({ id: 'r1', parentId: entry.id })
  })

  it('keeps a child’s prose out of the parent’s transcript', async () => {
    const { session } = fakeSession({ says: 'a long report' })
    const { fleet, events } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)

    const kinds = events.map(([, event]) => event.kind)
    expect(kinds).not.toContain('agent-message-delta')
    expect(kinds).not.toContain('usage')
  })

  it('fails a child that said nothing at all, and says so', async () => {
    const { session } = fakeSession({ says: '' })
    const { fleet } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)
    expect(entry.status).toBe('fail')
    expect(entry.output).toBe('the child reported nothing')
  })

  it('reports the model’s own error when that is why it said nothing', async () => {
    // Without this an authentication failure reads as an empty report, and the
    // parent model retries the identical spawn.
    const { session } = fakeSession({ says: '', errorMessage: 'no credentials for anthropic' })
    const { fleet } = fleetWith(session)

    expect((await fleet.run(PARENT, plan(), POOL, undefined)).output).toBe(
      'no credentials for anthropic',
    )
  })

  it('releases the name when it settles', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)

    const first = await fleet.run(PARENT, plan(), POOL, undefined)
    const second = await fleet.run(PARENT, plan(), POOL, undefined)
    expect(second.name).toBe(first.name)
    expect(fleet.liveCount).toBe(0)
  })

  it('marks the row settled as well as the entry', async () => {
    const { session } = fakeSession({})
    const { fleet, events } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)
    expect(events.at(-2)?.[1]).toMatchObject({ kind: 'agent-update' })
    expect(events.at(-1)?.[1]).toMatchObject({ kind: 'tool-end', status: 'ok' })
  })
})

describe('stopping a child', () => {
  it('drops its output rather than reporting half a report', async () => {
    const { session } = fakeSession({ says: 'half of a finding', hang: true })
    const { fleet } = fleetWith(session)

    const running = fleet.run(PARENT, plan(), POOL, undefined)
    await vi.waitFor(() => expect(fleet.liveCount).toBe(1))

    fleet.cancelThread('t1')

    const entry = await running
    expect(entry.status).toBe('cancelled')
    expect(entry.output).toBeUndefined()
  })

  it('leaves a thread that has no children alone', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)
    expect(() => fleet.cancelThread('nobody')).not.toThrow()
    await fleet.run(PARENT, plan(), POOL, undefined)
  })

  it('reports nothing to cancel for an id it has never seen', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)
    expect(fleet.cancel('no-such-child')).toBe(false)
  })
})

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
