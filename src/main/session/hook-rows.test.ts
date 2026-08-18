import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { hookTarget, runHooksFor } from './hook-rows'

function collect() {
  const events: { threadId: string; event: UiEvent }[] = []
  return { events, emit: (threadId: string, event: UiEvent) => events.push({ threadId, event }) }
}

const cwd = process.cwd()

describe('what a hook draws', () => {
  it('opens a row, fills it, and ends it', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 't1', {
      hooks: () => [{ on: 'turn.end', command: 'echo hi' }],
      cwdOf: () => cwd,
      emit,
    })

    const kinds = events.map((one) => one.event.kind)
    expect(kinds).toEqual(['tool-start', 'tool-body', 'tool-end'])

    const start = events[0].event as Extract<UiEvent, { kind: 'tool-start' }>
    expect(start.tool).toBe('hook')
    expect(start.target).toBe('echo hi')
    expect(start.detail).toBe('turn.end')

    const end = events[2].event as Extract<UiEvent, { kind: 'tool-end' }>
    expect(end.status).toBe('ok')
    expect(end.meta).toBe('ok')
  })

  it('marks a failure on the row rather than throwing', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 't1', {
      hooks: () => [{ on: 'turn.end', command: 'sh -c "exit 2"' }],
      cwdOf: () => cwd,
      emit,
    })

    const end = events.at(-1)?.event as Extract<UiEvent, { kind: 'tool-end' }>
    expect(end.status).toBe('fail')
    expect(end.meta).toBe('exit 2')
  })

  it('runs only the hooks bound to the point', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.start', 't1', {
      hooks: () => [
        { on: 'turn.end', command: 'echo end' },
        { on: 'turn.start', command: 'echo start' },
      ],
      cwdOf: () => cwd,
      emit,
    })

    const start = events[0].event as Extract<UiEvent, { kind: 'tool-start' }>
    expect(start.target).toBe('echo start')
    expect(events.filter((one) => one.event.kind === 'tool-start')).toHaveLength(1)
  })

  it('runs them in the order they were written', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 't1', {
      hooks: () => [
        { on: 'turn.end', command: 'echo first' },
        { on: 'turn.end', command: 'echo second' },
      ],
      cwdOf: () => cwd,
      emit,
    })

    // Two hooks on one point usually depend on each other — format, then test.
    const targets = events
      .filter((one) => one.event.kind === 'tool-start')
      .map((one) => (one.event as Extract<UiEvent, { kind: 'tool-start' }>).target)
    expect(targets).toEqual(['echo first', 'echo second'])
  })

  it('draws nothing at all when there are no hooks', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 't1', { hooks: () => [], cwdOf: () => cwd, emit })
    expect(events).toEqual([])
  })

  it('draws nothing for a thread with no working directory', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 'gone', {
      hooks: () => [{ on: 'turn.end', command: 'echo hi' }],
      cwdOf: () => undefined,
      emit,
    })
    expect(events).toEqual([])
  })

  it('leaves out the body when the hook said nothing', async () => {
    const { events, emit } = collect()

    await runHooksFor('turn.end', 't1', {
      hooks: () => [{ on: 'turn.end', command: 'sh -c "exit 0"' }],
      cwdOf: () => cwd,
      emit,
    })

    expect(events.map((one) => one.event.kind)).toEqual(['tool-start', 'tool-end'])
  })
})

describe('what the row is labelled', () => {
  it('is the command, shortened to what identifies it', () => {
    expect(hookTarget('pnpm test')).toBe('pnpm test')
    expect(hookTarget(`pnpm ${'x'.repeat(60)}`)).toHaveLength(48)
    expect(hookTarget(`pnpm ${'x'.repeat(60)}`).endsWith('…')).toBe(true)
  })
})
