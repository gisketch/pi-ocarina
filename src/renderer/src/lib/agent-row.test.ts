import { describe, expect, it } from 'vitest'
import { agentMark, agentTone, elapsedText } from './agent-row'

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
