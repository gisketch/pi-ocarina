import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SHIPPED_SERVERS, lspChip, lspEnabledFor, serverForPath } from '../../shared/lsp'
import { detectServers, hasRootFile, onPath, worthShowing } from './detect'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'piocarina-detect-'))
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('serverForPath', () => {
  it('routes a file to the server that owns its extension', () => {
    expect(serverForPath('src/app.ts')?.id).toBe('typescript')
    expect(serverForPath('src/App.svelte')?.id).toBe('svelte')
    expect(serverForPath('main.go')?.id).toBe('go')
    expect(serverForPath('Program.cs')?.id).toBe('csharp')
  })

  it('routes nothing for a language nobody configured', () => {
    expect(serverForPath('page.razor')).toBeNull()
    expect(serverForPath('Makefile')).toBeNull()
    expect(serverForPath('.gitignore')).toBeNull()
  })
})

describe('hasRootFile', () => {
  it('finds a named file', async () => {
    await writeFile(join(root, 'go.mod'), 'module x\n')
    expect(await hasRootFile(root, ['go.mod', 'go.work'])).toBe(true)
  })

  it('finds a file whose name cannot be known in advance', async () => {
    // A C# project is named after itself, so `*.csproj` is the only way to ask.
    await writeFile(join(root, 'Ocarina.csproj'), '<Project />')
    expect(await hasRootFile(root, ['*.sln', '*.csproj'])).toBe(true)
  })

  it('says no rather than throwing on a directory it cannot read', async () => {
    expect(await hasRootFile(join(root, 'nope'), ['go.mod'])).toBe(false)
  })

  it('says no when a server names no root file at all', async () => {
    expect(await hasRootFile(root, [])).toBe(false)
  })

  it('finds a marker below the root, which is where a polyglot repo keeps it', async () => {
    // The shape that made this necessary: a .NET solution at the top and the
    // React app in `src/frontend`, which was offered C# and nothing else.
    await mkdir(join(root, 'src', 'frontend'), { recursive: true })
    await writeFile(join(root, 'global.json'), '{}')
    await writeFile(join(root, 'src', 'frontend', 'package.json'), '{}')

    expect(await hasRootFile(root, ['global.json'])).toBe(true)
    expect(await hasRootFile(root, ['tsconfig.json', 'package.json'])).toBe(true)
  })

  it('never descends into dependencies or build output', async () => {
    await mkdir(join(root, 'node_modules', 'left-pad'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'left-pad', 'package.json'), '{}')

    expect(await hasRootFile(root, ['package.json'])).toBe(false)
  })

  it('stops at the stated depth', async () => {
    await mkdir(join(root, 'a', 'b', 'c', 'd'), { recursive: true })
    await writeFile(join(root, 'a', 'b', 'c', 'd', 'go.mod'), 'module x\n')

    expect(await hasRootFile(root, ['go.mod'])).toBe(false)
  })
})

describe('onPath', () => {
  it('finds an executable on PATH', async () => {
    const bin = join(root, 'bin')
    await mkdir(bin)
    await writeFile(join(bin, 'faux-ls'), '#!/bin/sh\n')
    await chmod(join(bin, 'faux-ls'), 0o755)

    expect(await onPath('faux-ls', { PATH: bin })).toBe(true)
    expect(await onPath('absent-ls', { PATH: bin })).toBe(false)
  })

  it('does not treat a file that is not executable as installed', async () => {
    const bin = join(root, 'bin')
    await mkdir(bin)
    await writeFile(join(bin, 'inert'), 'text')
    await chmod(join(bin, 'inert'), 0o644)

    expect(await onPath('inert', { PATH: bin })).toBe(false)
  })

  it('takes an absolute command as the path it is', async () => {
    const script = join(root, 'ls-wrapper')
    await writeFile(script, '#!/bin/sh\n')
    await chmod(script, 0o755)

    expect(await onPath(script, { PATH: '' })).toBe(true)
  })
})

describe('detectServers', () => {
  it('reports a polyglot workspace as both of its languages', async () => {
    // The case the whole design turns on: dotnet and react in one repository.
    await writeFile(join(root, 'tsconfig.json'), '{}')
    await writeFile(join(root, 'Api.csproj'), '<Project />')

    const states = await detectServers(root, { on: true }, { env: { PATH: '' } })
    const plausible = states.filter((state) => state.plausible).map((state) => state.id)

    expect(plausible).toContain('typescript')
    expect(plausible).toContain('csharp')
    expect(plausible).not.toContain('go')
  })

  it('marks a plausible server that is not installed, with how to install it', async () => {
    await writeFile(join(root, 'Cargo.toml'), '[package]\n')

    const states = await detectServers(root, { on: true }, { env: { PATH: '' } })
    const rust = states.find((state) => state.id === 'rust')!

    expect(rust.plausible).toBe(true)
    expect(rust.installed).toBe(false)
    expect(rust.install).toContain('rust-analyzer')
  })

  it('reports everything as disabled when the workspace never opted in', async () => {
    await writeFile(join(root, 'tsconfig.json'), '{}')

    const states = await detectServers(root, undefined, { env: { PATH: '' } })
    expect(states.every((state) => !state.enabled)).toBe(true)
  })

  it('covers every shipped server', async () => {
    const states = await detectServers(root, undefined, { env: { PATH: '' } })
    expect(states).toHaveLength(SHIPPED_SERVERS.length)
  })
})

describe('lspEnabledFor', () => {
  it('is off unless the workspace turned it on', () => {
    expect(lspEnabledFor(undefined, 'typescript')).toBe(false)
    expect(lspEnabledFor({ on: false }, 'typescript')).toBe(false)
    expect(lspEnabledFor({ on: true }, 'typescript')).toBe(true)
  })

  it('lets one server be switched off without switching off the rest', () => {
    const settings = { on: true, servers: { python: false } }
    expect(lspEnabledFor(settings, 'python')).toBe(false)
    expect(lspEnabledFor(settings, 'typescript')).toBe(true)
  })
})

describe('worthShowing', () => {
  const state = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    label: id,
    plausible: false,
    installed: false,
    enabled: false,
    install: '',
    ...over,
  })

  it('shows what could be used here', () => {
    const shown = worthShowing([state('go', { plausible: true }), state('rust')])
    expect(shown.map((one) => one.id)).toEqual(['go'])
  })

  it('keeps showing a server the reader has an opinion about', () => {
    // Switched off explicitly, so it has to stay switchable back on.
    const shown = worthShowing([state('rust', { explicit: true, enabled: false })])
    expect(shown.map((one) => one.id)).toEqual(['rust'])
  })

  it('does not offer a language the workspace does not contain', () => {
    // The master switch being on is not a reason to list Rust for a repository
    // with no Cargo.toml.
    const shown = worthShowing([state('rust', { enabled: true })])
    expect(shown).toEqual([])
  })
})

describe('lspChip', () => {
  const state = (over: Record<string, unknown>) => ({
    id: 'x',
    label: 'x',
    plausible: true,
    installed: true,
    enabled: true,
    install: '',
    ...over,
  })

  it('says nothing at all when the workspace is not using it', () => {
    expect(lspChip([state({ enabled: false })])).toBeNull()
  })

  it('counts the servers that are actually running', () => {
    expect(lspChip([state({ running: true }), state({ running: true })])).toBe('lsp 2')
  })

  it('is dim rather than absent when it is on but nothing has started', () => {
    expect(lspChip([state({})])).toBe('lsp')
  })

  it('marks a degraded server so the reader knows why answers changed', () => {
    expect(lspChip([state({ running: true }), state({ degraded: true })])).toBe('lsp 1!')
  })
})
