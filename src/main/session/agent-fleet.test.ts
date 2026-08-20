import { describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { DEFAULT_ROLES } from '../../shared/agent-roles'
import { AgentFleet, MAX_RUNNING, OUTPUT_CAP, type ChildFactory, type ParentRef } from './agent-fleet'
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
  usage?: Record<string, unknown>
  /** How many model messages the turn closes. More than one is what a child
   *  that uses tools actually does, and what the live usage figure counts. */
  messages?: number
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
      for (let n = 0; n < (options.messages ?? 1); n += 1) {
        emit({
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: options.says ?? 'done' }],
            usage: options.usage ?? { input: 10, output: 4, cost: { total: 0.001 } },
            ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
          },
        })
      }
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

describe('which model a child runs on', () => {
  it('carries what the factory built it with, not what its role asked for', async () => {
    // The factory falls back when a role names a model this machine has not
    // configured. The entry has to say what actually ran, or a reader watching
    // a slow child cannot see the one fact that explains it.
    const { session } = fakeSession({})
    const events: [string, UiEvent][] = []
    const factory: ChildFactory = {
      child: async () => ({ session, model: 'anthropic/fell-back-to-this' }) as never,
    }
    const fleet = new AgentFleet(factory, (id, event) => events.push([id, event]))

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)

    expect(entry.model).toBe('anthropic/fell-back-to-this')
    // On every update from the moment the session exists — the first one is
    // the unqueue, which happens before there is a model to name.
    const updates = events
      .filter(([, event]) => event.kind === 'agent-update')
      .map(([, event]) => (event as { agent: { model?: string } }).agent)
    expect(updates.slice(1).every((agent) => agent.model === 'anthropic/fell-back-to-this')).toBe(
      true,
    )
  })

  it('stops reading as queued before its session is built, not after', async () => {
    // Building a session loads pi, its model runtime and its resource loader.
    // A row still marked queued through all of that reads as a child waiting
    // for a slot it is already holding — four of them as a stuck fan-out.
    const { session } = fakeSession({})
    let build: (() => void) | undefined
    const events: [string, UiEvent][] = []
    const factory: ChildFactory = {
      child: () =>
        new Promise((resolve) => {
          build = () => resolve({ session, model: 'anthropic/m' } as never)
        }),
    }
    const fleet = new AgentFleet(factory, (id, event) => events.push([id, event]))
    const run = fleet.run(PARENT, plan(), POOL, undefined)

    await vi.waitFor(() => expect(build).toBeDefined())
    const mid = events.at(-1)?.[1] as { kind: string; agent?: { queued?: true } }
    expect(mid.kind).toBe('agent-update')
    expect(mid.agent?.queued).toBeUndefined()

    build?.()
    await run
  })

  it('says nothing when the app named no model and pi chose its own', async () => {
    const { session } = fakeSession({})
    const { fleet } = fleetWith(session)

    expect((await fleet.run(PARENT, plan(), POOL, undefined)).model).toBeUndefined()
  })
})

describe('what a child has spent, while it is spending it', () => {
  it('reports a growing figure as the child works, not one at the end', async () => {
    // The peek is opened while a child runs. Before this it read zero for the
    // whole window it was open for, then the truth once the child had stopped.
    const { session } = fakeSession({ messages: 3 })
    const { fleet, events } = fleetWith(session)

    await fleet.run(PARENT, plan(), POOL, undefined)

    const running = events
      .filter(([, event]) => event.kind === 'agent-update')
      .map(([, event]) => (event as { agent: { status: string; usage: { input: number } } }).agent)
      .filter((agent) => agent.status === 'running')

    // One for the start, then one per closed message.
    expect(running.map((agent) => agent.usage.input)).toEqual([0, 10, 20, 30])
  })

  it('charges the thread once, however many times the figure was reported', async () => {
    const { session } = fakeSession({ messages: 3 })
    const { fleet } = fleetWith(session)

    const entry = await fleet.run(PARENT, plan(), POOL, undefined)

    expect(entry.usage).toMatchObject({ input: 30, output: 12 })
    expect(fleet.spentIn('t1')).toMatchObject({ tokens: 42, costUsd: 0.003 })
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
