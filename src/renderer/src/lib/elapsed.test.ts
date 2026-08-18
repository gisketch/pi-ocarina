import { describe, expect, it } from 'vitest'
import { elapsed } from './elapsed'

describe('how long something took', () => {
  it('counts seconds under a minute', () => {
    expect(elapsed(0)).toBe('0s')
    expect(elapsed(4_200)).toBe('4s')
    expect(elapsed(59_999)).toBe('59s')
  })

  it('rounds down, so a counter never reports the future', () => {
    expect(elapsed(3_900)).toBe('3s')
    expect(elapsed(119_900)).toBe('1m59s')
  })

  it('pads the seconds past a minute, so the width stops changing', () => {
    expect(elapsed(60_000)).toBe('1m00s')
    expect(elapsed(64_000)).toBe('1m04s')
    expect(elapsed(69_000)).toBe('1m09s')
    expect(elapsed(70_000)).toBe('1m10s')
  })

  it('drops the seconds past an hour', () => {
    expect(elapsed(3_600_000)).toBe('1h00m')
    expect(elapsed(3_900_000)).toBe('1h05m')
  })

  it('treats a clock that went backwards as no time at all', () => {
    // The clock ticks once a second; a turn that started between ticks can be
    // read as starting in the future.
    expect(elapsed(-500)).toBe('0s')
  })

  it('keeps its width steady while a turn runs past a minute', () => {
    const widths = new Set(
      [60_000, 65_000, 70_000, 119_000].map((ms) => elapsed(ms).length),
    )
    expect(widths.size).toBe(1)
  })
})
