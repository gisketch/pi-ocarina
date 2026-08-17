import { describe, expect, it, vi } from 'vitest'
import type { LspServerSpec, WorkspaceLsp } from '../../shared/lsp'
import type { LspClient } from './client'
import { IDLE_MS, LspPool, NoServerError } from './pool'

const SPECS: LspServerSpec[] = [
  {
    id: 'typescript',
    label: 'TS',
    extensions: ['.ts'],
    command: 'ts-ls',
    args: [],
    rootFiles: [],
    install: '',
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['.cs'],
    command: 'cs-ls',
    args: [],
    rootFiles: [],
    install: '',
  },
]

const ON: WorkspaceLsp = { on: true }

function stubClient(id: string, over: Partial<LspClient> = {}): LspClient {
  return {
    id,
    documentSymbols: async () => [],
    definition: async () => [],
    references: async () => [],
    hover: async () => '',
    rename: async () => [],
    diagnostics: async () => [],
    stop: async () => {},
    ...over,
  }
}

/** A pool over stub clients, with time in the test's hands. */
function makePool(over: { start?: (spec: LspServerSpec) => Promise<LspClient> } = {}) {
  let now = 1_000
  const started: string[] = []
  const stopped: string[] = []

  const pool = new LspPool('/w', {
    servers: SPECS,
    now: () => now,
    start:
      over.start ??
      (async (spec) => {
        started.push(spec.id)
        return stubClient(spec.id, {
          stop: async () => {
            stopped.push(spec.id)
          },
        })
      }),
  })

  return { pool, started, stopped, advance: (ms: number) => (now += ms) }
}

describe('choosing a server', () => {
  it('routes a file to the server that owns it', () => {
    const { pool } = makePool()
    expect(pool.specFor('/w/a.ts', ON)?.id).toBe('typescript')
    expect(pool.specFor('/w/Program.cs', ON)?.id).toBe('csharp')
  })

  it('routes nothing when the workspace never turned LSP on', () => {
    const { pool } = makePool()
    expect(pool.specFor('/w/a.ts', undefined)).toBeNull()
    expect(pool.specFor('/w/a.ts', { on: false })).toBeNull()
  })

  it('routes nothing for a server switched off on its own', () => {
    const { pool } = makePool()
    expect(pool.specFor('/w/a.ts', { on: true, servers: { typescript: false } })).toBeNull()
    expect(pool.specFor('/w/Program.cs', { on: true, servers: { typescript: false } })?.id).toBe(
      'csharp',
    )
  })

  it('refuses a language nobody configured, by name', async () => {
    const { pool } = makePool()
    await expect(pool.withClient('/w/page.razor', ON, async () => 1)).rejects.toBeInstanceOf(
      NoServerError,
    )
  })
})

describe('starting and sharing', () => {
  it('starts nothing until a call needs one', async () => {
    const { pool, started } = makePool()
    expect(started).toEqual([])

    await pool.withClient('/w/a.ts', ON, async () => 1)
    expect(started).toEqual(['typescript'])
  })

  it('shares one process across calls for the same language', async () => {
    const { pool, started } = makePool()

    await pool.withClient('/w/a.ts', ON, async () => 1)
    await pool.withClient('/w/b.ts', ON, async () => 2)

    expect(started).toEqual(['typescript'])
  })

  it('runs a server per language in a polyglot workspace', async () => {
    const { pool, started } = makePool()

    await pool.withClient('/w/a.ts', ON, async () => 1)
    await pool.withClient('/w/Program.cs', ON, async () => 2)

    expect(started.sort()).toEqual(['csharp', 'typescript'])
    expect(pool.running().map((one) => one.id).sort()).toEqual(['csharp', 'typescript'])
  })

  it('starts one process when two calls arrive together', async () => {
    // Without the in-flight map, a fan-out would spawn a type-checker per call.
    const { pool, started } = makePool()

    await Promise.all([
      pool.withClient('/w/a.ts', ON, async () => 1),
      pool.withClient('/w/b.ts', ON, async () => 2),
      pool.withClient('/w/c.ts', ON, async () => 3),
    ])

    expect(started).toEqual(['typescript'])
  })
})

describe('letting go', () => {
  it('stops a server that has been idle long enough', async () => {
    const { pool, stopped, advance } = makePool()
    await pool.withClient('/w/a.ts', ON, async () => 1)

    advance(IDLE_MS + 1)
    await pool.reapIdle()

    expect(stopped).toEqual(['typescript'])
    expect(pool.running()).toEqual([])
  })

  it('keeps a server that was used recently', async () => {
    const { pool, stopped, advance } = makePool()
    await pool.withClient('/w/a.ts', ON, async () => 1)

    advance(IDLE_MS - 1)
    await pool.reapIdle()

    expect(stopped).toEqual([])
  })

  it('never reaps a server with a call still in flight', async () => {
    // The reaper runs on a timer, so it can fire in the middle of a long
    // request. Stopping the process under it would fail the call.
    const { pool, stopped, advance } = makePool()

    let release = (): void => {}
    let began = (): void => {}
    const running = new Promise<void>((resolve) => (began = resolve))

    const held = pool.withClient('/w/a.ts', ON, async () => {
      advance(IDLE_MS * 2)
      began()
      await new Promise<void>((resolve) => (release = resolve))
      return 1
    })

    await running
    await pool.reapIdle()
    expect(stopped).toEqual([])

    release()
    await held
  })

  it('stops everything when the workspace goes away', async () => {
    const { pool, stopped } = makePool()
    await pool.withClient('/w/a.ts', ON, async () => 1)
    await pool.withClient('/w/Program.cs', ON, async () => 2)

    await pool.stopAll()

    expect(stopped.sort()).toEqual(['csharp', 'typescript'])
    expect(pool.running()).toEqual([])
  })
})

describe('when a server dies', () => {
  it('replaces it and replays a read', async () => {
    const started: string[] = []
    let attempt = 0
    const { pool } = makePool({
      start: async (spec) => {
        started.push(spec.id)
        return stubClient(spec.id)
      },
    })

    const answer = await pool.withClient('/w/a.ts', ON, async () => {
      attempt += 1
      if (attempt === 1) throw new Error('write EPIPE')
      return 'found'
    })

    expect(answer).toBe('found')
    expect(attempt).toBe(2)
    expect(started).toEqual(['typescript', 'typescript'])
  })

  it('never replays a call that changes something', async () => {
    // A rename replayed against a fresh server could apply twice. A failed
    // rename is recoverable; a doubled one is not.
    const { pool } = makePool()
    const work = vi.fn().mockRejectedValue(new Error('write EPIPE'))

    await expect(pool.withClient('/w/a.ts', ON, work, true)).rejects.toThrow('EPIPE')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('marks the server degraded when the replay fails too', async () => {
    const { pool } = makePool()
    await expect(
      pool.withClient('/w/a.ts', ON, async () => {
        throw new Error('write EPIPE')
      }),
    ).rejects.toThrow()

    expect(pool.running()).toEqual([{ id: 'typescript', degraded: true }])
  })
})

describe('what the reader is shown', () => {
  it('marks a running server as running', async () => {
    const { pool } = makePool()
    await pool.withClient('/w/a.ts', ON, async () => 1)

    const states = pool.decorate([
      { id: 'typescript', label: 'TS', plausible: true, installed: true, enabled: true, install: '' },
      { id: 'csharp', label: 'C#', plausible: true, installed: true, enabled: true, install: '' },
    ])

    expect(states[0].running).toBe(true)
    expect(states[1].running).toBeUndefined()
  })
})

describe('isRunning', () => {
  it('is false before anything started, so an edit never waits on a cold start', async () => {
    const { pool } = makePool()
    expect(pool.isRunning('/w/a.ts')).toBe(false)

    await pool.withClient('/w/a.ts', ON, async () => 1)
    expect(pool.isRunning('/w/a.ts')).toBe(true)
    expect(pool.isRunning('/w/Program.cs')).toBe(false)
  })
})
