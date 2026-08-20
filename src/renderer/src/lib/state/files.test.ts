import { describe, expect, it, vi } from 'vitest'
import { session } from '../session'

vi.mock('../bridge', () => ({
  bridge: {
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
  },
  isDesktop: true,
}))

import { files } from './files.svelte'

describe('the file index refresh', () => {
  it('keeps serving the old list until the new walk answers', async () => {
    let answer!: (files: string[]) => void
    const invoke = vi
      .spyOn(session, 'invoke')
      .mockImplementationOnce(() => Promise.resolve({ files: ['a.ts'] } as never))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = (walked) => resolve({ files: walked } as never)
          }) as never,
      )

    files.refresh('w-refresh')
    // Past the whole then/catch/finally chain, so the loading guard clears.
    await new Promise((tick) => setTimeout(tick, 0))
    expect(files.files('w-refresh')).toEqual(['a.ts'])
    expect(files.loaded('w-refresh')).toBe(true)

    // The re-walk is in flight; the cache still serves. Forced, because the
    // TTL would otherwise swallow a second walk this soon after the first.
    files.refresh('w-refresh', { force: true })
    expect(files.files('w-refresh')).toEqual(['a.ts'])

    answer(['a.ts', 'b.ts'])
    await new Promise((tick) => setTimeout(tick, 0))
    expect(files.files('w-refresh')).toEqual(['a.ts', 'b.ts'])
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('is not loaded before the first walk ever answers', () => {
    vi.spyOn(session, 'invoke').mockImplementation(() => new Promise(() => {}) as never)
    files.refresh('w-fresh')
    expect(files.loaded('w-fresh')).toBe(false)
    expect(files.files('w-fresh')).toEqual([])
  })

  it('a failed re-walk keeps the cache it already had', async () => {
    vi.spyOn(session, 'invoke').mockImplementationOnce(() =>
      Promise.resolve({ files: ['kept.ts'] } as never),
    )
    files.refresh('w-fail')
    await new Promise((tick) => setTimeout(tick, 0))

    vi.spyOn(session, 'invoke').mockImplementationOnce(() => Promise.reject(new Error('gone')))
    files.refresh('w-fail', { force: true })
    await new Promise((tick) => setTimeout(tick, 0))

    expect(files.files('w-fail')).toEqual(['kept.ts'])
  })

  it('serves a fresh answer from cache instead of walking again', async () => {
    // `␣f` re-opened seconds after closing used to put a whole crawl behind
    // the open. Inside the TTL the cache is the answer; past it, the walk runs.
    const invoke = vi
      .spyOn(session, 'invoke')
      .mockImplementation(() => Promise.resolve({ files: ['a.ts'] } as never))
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    files.refresh('w-ttl')
    await new Promise((tick) => setTimeout(tick, 0))
    files.refresh('w-ttl')
    expect(invoke).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000 + 31_000)
    files.refresh('w-ttl')
    await new Promise((tick) => setTimeout(tick, 0))
    expect(invoke).toHaveBeenCalledTimes(2)

    now.mockRestore()
  })
})
