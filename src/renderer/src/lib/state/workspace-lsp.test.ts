import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LspServerState } from '../../../../shared/lsp'

const invoke = vi.fn()
let wired = true
vi.mock('../session', () => ({
  session: {
    get wired() {
      return wired
    },
    invoke: (...args: unknown[]) => invoke(...args),
    onEvents: () => () => {},
  },
}))

const { workspaceLsp } = await import('./workspace-lsp.svelte')

const server = (over: Partial<LspServerState> = {}): LspServerState => ({
  id: 'typescript',
  label: 'TypeScript',
  plausible: true,
  installed: true,
  enabled: true,
  install: 'npm i -g typescript-language-server',
  ...over,
})

beforeEach(() => {
  invoke.mockReset()
  wired = true
  workspaceLsp.forget()
})

describe('reading the workspace', () => {
  it('asks main, because only main may look at the disk', async () => {
    invoke.mockResolvedValue({ on: true, servers: [server()] })

    await workspaceLsp.load('w1')

    expect(invoke).toHaveBeenCalledWith('workspaceLsp', { workspaceId: 'w1' })
    expect(workspaceLsp.on).toBe(true)
    expect(workspaceLsp.servers).toHaveLength(1)
  })

  it('reports a failure rather than showing an empty screen as an answer', async () => {
    invoke.mockRejectedValue(new Error('no such workspace'))

    await workspaceLsp.load('w1')

    expect(workspaceLsp.error).toBe('no such workspace')
    expect(workspaceLsp.loading).toBe(false)
  })

  it('shows a plausible workspace in the browser harness', async () => {
    // A screen that says "error" where seven rows belong cannot be reviewed
    // against the design.
    wired = false
    await workspaceLsp.load('w1')

    expect(workspaceLsp.servers.length).toBeGreaterThan(0)
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('switching', () => {
  it('sends the change and redraws from main', async () => {
    // Turning LSP off stops processes, and only main knows what stopped.
    invoke.mockResolvedValue({ on: false, servers: [] })

    await workspaceLsp.load('w1')
    invoke.mockClear()
    invoke.mockResolvedValue({ on: false, servers: [server({ enabled: false })] })

    await workspaceLsp.set({ on: false })

    expect(invoke).toHaveBeenNthCalledWith(1, 'setWorkspaceLsp', { workspaceId: 'w1', on: false })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspaceLsp', { workspaceId: 'w1' })
  })

  it('switches one server by id', async () => {
    invoke.mockResolvedValue({ on: true, servers: [server()] })
    await workspaceLsp.load('w1')
    invoke.mockClear()
    invoke.mockResolvedValue({ on: true, servers: [server({ enabled: false })] })

    await workspaceLsp.set({ serverId: 'python', enabled: false })

    expect(invoke).toHaveBeenNthCalledWith(1, 'setWorkspaceLsp', {
      workspaceId: 'w1',
      serverId: 'python',
      enabled: false,
    })
  })
})

describe('the chip', () => {
  it('says nothing when the workspace is not using language servers', async () => {
    invoke.mockResolvedValue({ on: false, servers: [server({ enabled: false })] })
    await workspaceLsp.load('w1')

    expect(workspaceLsp.chip).toBeNull()
  })

  it('counts what is running', async () => {
    invoke.mockResolvedValue({
      on: true,
      servers: [server({ running: true }), server({ id: 'csharp', running: true })],
    })
    await workspaceLsp.load('w1')

    expect(workspaceLsp.chip).toBe('lsp 2')
  })

  it('marks a degraded server', async () => {
    invoke.mockResolvedValue({
      on: true,
      servers: [server({ running: true }), server({ id: 'go', degraded: true })],
    })
    await workspaceLsp.load('w1')

    expect(workspaceLsp.chip).toBe('lsp 1!')
  })
})
