import { describe, expect, it } from 'vitest'
import { agentMark, agentTone, doingIn, elapsedText } from './agent-row'

describe('a settled child', () => {
  it('marks each way out apart', () => {
    const marks = (['ok', 'fail', 'denied', 'cancelled'] as const).map(agentMark)
    expect(new Set(marks).size).toBe(4)
  })

  it('colours stopped-by-a-person the same for both of its shapes', () => {
    expect(agentTone('denied')).toBe('warn')
    expect(agentTone('cancelled')).toBe('warn')
    expect(agentTone('ok')).toBe('ok')
    expect(agentTone('fail')).toBe('fail')
  })

  it('leaves a running child untoned', () => {
    expect(agentTone('running')).toBe('')
  })
})

describe('the clock', () => {
  it('keeps one width from the first second to the last minute of the hour', () => {
    const widths = new Set(
      [0, 1_000, 9_000, 59_000, 60_000, 599_000, 3_599_000].map((ms) => elapsedText(ms).length),
    )
    expect(widths.size).toBe(1)
  })

  it('reads as minutes and seconds', () => {
    expect(elapsedText(0)).toBe('00:00')
    expect(elapsedText(9_400)).toBe('00:09')
    expect(elapsedText(75_000)).toBe('01:15')
    expect(elapsedText(3_599_000)).toBe('59:59')
  })

  it('grows for an hour rather than lying about it', () => {
    expect(elapsedText(3_600_000)).toBe('1:00:00')
  })

  it('never reads as negative when the clock is behind the start', () => {
    expect(elapsedText(-5_000)).toBe('00:00')
  })
})

describe('what a child is doing now', () => {
  const agent = {
    id: 'c1',
    name: 'circe',
    role: 'scout',
    label: 'find callers',
    status: 'running' as const,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    startedAt: 0,
  }
  const row = (id: string, status: 'running' | 'ok') => ({
    id,
    kind: 'read' as const,
    target: `${id}.ts`,
    status,
  })

  it('says it is queued while it waits for a slot', () => {
    // "Waiting" and "working" look identical otherwise, and only one of them is
    // worth interrupting.
    expect(doingIn({ ...agent, queued: true }, [])).toBe('queued')
  })

  it('says it is thinking before it has called anything', () => {
    expect(doingIn(agent, [])).toBe('thinking')
    expect(doingIn(agent, undefined)).toBe('thinking')
  })

  it('shows the newest unfinished call', () => {
    const doing = doingIn(agent, [row('a', 'ok'), row('b', 'running'), row('c', 'running')])
    expect(doing).toContain('c.ts')
  })

  it('falls back to thinking once every call has settled', () => {
    expect(doingIn(agent, [row('a', 'ok')])).toBe('thinking')
  })
})

describe('a child that is running a child of its own', () => {
  const agent = {
    id: 'c1',
    name: 'odysseus',
    role: 'developer',
    label: 'implement it',
    status: 'running' as const,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    startedAt: 0,
  }

  it('names the grandchild rather than saying only "working"', () => {
    const doing = doingIn(agent, [
      {
        id: 'g1',
        kind: 'agent' as const,
        target: '',
        status: 'running' as const,
        agent: { ...agent, id: 'g1', name: 'hermes', role: 'scout', label: 'check the tests' },
      },
    ])
    expect(doing).toContain('hermes')
    expect(doing).toContain('check the tests')
  })
})
