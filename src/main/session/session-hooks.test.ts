/** Which hook points a live turn actually fires, and when.
 *
 *  `subscribeSession` had no test at all, so "turn.start runs" and
 *  "edit.after only runs when something was edited" were claims nothing pinned
 *  — and the first of them was false. */

import { describe, expect, it, vi } from 'vitest'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { HookPoint } from '../../shared/config-file'
import { PiTranslator } from './pi-translate'
import { ChangeLog } from './change-log'
import { subscribeSession } from './session-events'
import { SteerQueue } from './steering'

function harness() {
  const fired: HookPoint[] = []
  let listener: (event: unknown) => void = () => {}

  const session = {
    subscribe: (fn: (event: unknown) => void) => {
      listener = fn
      return () => {}
    },
    getSessionStats: () => ({ contextUsage: undefined, usage: undefined }),
  } as unknown as AgentSession

  subscribeSession({
    session,
    threadId: 't1',
    cwd: '/repo',
    translator: new PiTranslator(),
    emit: () => {},
    changes: new ChangeLog(),
    steers: new SteerQueue(() => {}),
    spent: () => ({ tokens: 0, costUsd: 0 }),
    hooks: async (point) => {
      fired.push(point)
    },
  })

  return { fired, send: (event: unknown) => listener(event) }
}

const edit = { type: 'tool_execution_start', toolName: 'edit', toolCallId: 'c1', args: { path: 'a' } }
const read = { type: 'tool_execution_start', toolName: 'read', toolCallId: 'c2', args: { path: 'a' } }

describe('which points a turn fires', () => {
  it('fires turn.start when the turn starts', async () => {
    const { fired, send } = harness()
    send({ type: 'turn_start' })
    await vi.waitFor(() => expect(fired).toEqual(['turn.start']))
  })

  it('fires edit.after and then turn.end when the turn changed a file', async () => {
    const { fired, send } = harness()
    send({ type: 'turn_start' })
    send(edit)
    send({ type: 'turn_end' })

    await vi.waitFor(() => expect(fired).toEqual(['turn.start', 'edit.after', 'turn.end']))
  })

  it('skips edit.after on a turn that only read', async () => {
    // A formatter has nothing to format, and a row saying it ran would be a
    // row about nothing.
    const { fired, send } = harness()
    send({ type: 'turn_start' })
    send(read)
    send({ type: 'turn_end' })

    await vi.waitFor(() => expect(fired).toEqual(['turn.start', 'turn.end']))
  })

  it('forgets the previous turn’s edits, so the next one is judged on its own', async () => {
    const { fired, send } = harness()
    send({ type: 'turn_start' })
    send(edit)
    send({ type: 'turn_end' })
    await vi.waitFor(() => expect(fired).toContain('edit.after'))

    fired.length = 0
    send({ type: 'turn_start' })
    send({ type: 'turn_end' })
    await vi.waitFor(() => expect(fired).toEqual(['turn.start', 'turn.end']))
  })

  it('fires nothing for a session with no hooks wired', () => {
    const session = {
      subscribe: () => () => {},
      getSessionStats: () => ({ contextUsage: undefined }),
    } as unknown as AgentSession

    expect(() =>
      subscribeSession({
        session,
        threadId: 't1',
        cwd: '/repo',
        translator: new PiTranslator(),
        emit: () => {},
        changes: new ChangeLog(),
        steers: new SteerQueue(() => {}),
        spent: () => ({ tokens: 0, costUsd: 0 }),
      }),
    ).not.toThrow()
  })
})
