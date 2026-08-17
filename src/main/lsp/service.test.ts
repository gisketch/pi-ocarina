import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkspaceLsp } from '../../shared/lsp'
import { handleLsp, LspService, type LspSettingsStore } from './service'
import { LspPool } from './pool'
import type { LspClient } from './client'

let root = ''

/** The catalog, reduced to the three things the service reads and writes. */
function store(initial?: WorkspaceLsp): LspSettingsStore & { saved?: WorkspaceLsp } {
  let held = initial
  return {
    get saved() {
      return held
    },
    lspFor: () => held,
    setLsp: (_id, lsp) => {
      held = lsp
    },
    workspace: () => ({ path: root }),
  }
}

const client: LspClient = {
  id: 'typescript',
  documentSymbols: async () => [],
  definition: async () => [],
  references: async () => [],
  hover: async () => '',
  rename: async () => [],
  diagnostics: async () => [],
  stop: async () => {},
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'piocarina-lsp-service-'))
  await writeFile(join(root, 'tsconfig.json'), '{}')
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('what the settings screen is shown', () => {
  it('lists the servers that make sense here, and nothing else', async () => {
    const service = new LspService(store({ on: true }))
    const { on, servers } = await service.states('w1')

    expect(on).toBe(true)
    expect(servers.map((one) => one.id)).toContain('typescript')
    expect(servers.map((one) => one.id)).not.toContain('rust')
  })

  it('reports off, with the same list, before anyone opts in', async () => {
    const service = new LspService(store())
    const { on, servers } = await service.states('w1')

    expect(on).toBe(false)
    expect(servers.find((one) => one.id === 'typescript')?.enabled).toBe(false)
  })

  it('says nothing at all for a workspace that is gone', async () => {
    const service = new LspService({ ...store(), workspace: () => undefined })
    expect(await service.states('w1')).toEqual({ on: false, servers: [] })
  })

  it('marks a server that is actually running', async () => {
    const held = store({ on: true })
    const service = new LspService(held, (at) => new LspPool(at, { start: async () => client }))

    const pool = service.poolFor('w1', root)
    await pool.withClient(join(root, 'a.ts'), { on: true }, async () => 1)

    const { servers } = await service.states('w1')
    expect(servers.find((one) => one.id === 'typescript')?.running).toBe(true)
  })
})

describe('switching it', () => {
  it('turns the workspace on and remembers it', async () => {
    const held = store()
    const service = new LspService(held)

    await service.set('w1', { on: true })
    expect(held.saved).toEqual({ on: true })
  })

  it('switches one server without touching the rest', async () => {
    const held = store({ on: true })
    const service = new LspService(held)

    await service.set('w1', { serverId: 'python', enabled: false })

    expect(held.saved).toEqual({ on: true, servers: { python: false } })
    const { servers } = await service.states('w1')
    expect(servers.find((one) => one.id === 'typescript')?.enabled).toBe(true)
  })

  it('stops the servers it just switched off', async () => {
    // Leaving a process running after the reader switched it off would make
    // the setting a suggestion.
    let stopped = false
    const service = new LspService(
      store({ on: true }),
      (at) =>
        new LspPool(at, {
          start: async () => ({
            ...client,
            stop: async () => {
              stopped = true
            },
          }),
        }),
    )

    const pool = service.poolFor('w1', root)
    await pool.withClient(join(root, 'a.ts'), { on: true }, async () => 1)
    expect(pool.running()).toHaveLength(1)

    await service.set('w1', { on: false })

    expect(stopped).toBe(true)
    expect(pool.running()).toEqual([])
  })

  it('keeps one pool per workspace', () => {
    const service = new LspService(store())
    expect(service.poolFor('w1', root)).toBe(service.poolFor('w1', root))
    expect(service.poolFor('w2', root)).not.toBe(service.poolFor('w1', root))
  })
})

describe('the commands', () => {
  it('reads and writes through the same service', async () => {
    const held = store()
    const service = new LspService(held)

    await handleLsp(service, 'setWorkspaceLsp', { workspaceId: 'w1', on: true })
    const state = (await handleLsp(service, 'workspaceLsp', { workspaceId: 'w1' })) as {
      on: boolean
    }

    expect(state.on).toBe(true)
  })

  it('refuses a command that is not one of its own', async () => {
    const service = new LspService(store())
    await expect(handleLsp(service, 'listRoles', {})).rejects.toThrow('not an lsp command')
  })
})
