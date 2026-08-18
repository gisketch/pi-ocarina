/** What a language server is, and which one a file belongs to.
 *
 *  A server is data. Adding a language is a row in `SHIPPED_SERVERS` and a
 *  fixture — never a class, never a branch. That is the whole reason this app
 *  runs its own client rather than depending on someone else's extension: the
 *  set of languages a repository mixes is not knowable in advance, and a
 *  polyglot repository is the normal case, not the hard one. */

export interface LspServerSpec {
  id: string
  label: string
  /** File extensions, with the dot. What routes a path to this server. */
  extensions: string[]
  /** The binary, spawned without a shell. */
  command: string
  args: string[]
  /** Any one of these at the workspace root makes this server plausible here. */
  rootFiles: string[]
  /** Shown when the binary is missing. Copied by the reader, never run by us:
   *  installing software is their action, not ours. */
  install: string
  /** Sent as `initializationOptions`, for servers that need one. */
  initialization?: Record<string, unknown>
}

/** The languages this app knows how to start.
 *
 *  Commands are the ones each ecosystem publishes. A workspace may override
 *  any of them, which is how a project pins a version or points at a wrapper. */
export const SHIPPED_SERVERS: readonly LspServerSpec[] = [
  {
    id: 'typescript',
    label: 'TypeScript / JavaScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootFiles: ['tsconfig.json', 'jsconfig.json', 'package.json'],
    install: 'npm i -g typescript-language-server typescript',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    extensions: ['.svelte'],
    command: 'svelteserver',
    args: ['--stdio'],
    rootFiles: ['svelte.config.js', 'svelte.config.ts'],
    install: 'npm i -g svelte-language-server',
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['.py', '.pyi'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    rootFiles: ['pyproject.toml', 'setup.py', 'requirements.txt', 'setup.cfg'],
    install: 'npm i -g pyright',
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    command: 'gopls',
    args: [],
    rootFiles: ['go.mod', 'go.work'],
    install: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    rootFiles: ['Cargo.toml'],
    install: 'rustup component add rust-analyzer',
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['.cs'],
    command: 'csharp-ls',
    args: [],
    rootFiles: ['*.sln', '*.csproj', 'global.json'],
    // The install puts the binary in `~/.dotnet/tools`, which nothing adds to
    // PATH. A reader who ran only the first line had installed the server and
    // still read that it was missing.
    install: 'dotnet tool install --global csharp-ls && export PATH="$PATH:$HOME/.dotnet/tools"',
  },
  {
    id: 'json',
    label: 'JSON',
    extensions: ['.json', '.jsonc'],
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    rootFiles: ['package.json'],
    install: 'npm i -g vscode-langservers-extracted',
  },
]

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/** Which server owns this file, if any is configured for it. */
export function serverForPath(
  path: string,
  servers: readonly LspServerSpec[] = SHIPPED_SERVERS,
): LspServerSpec | null {
  const extension = extensionOf(path)
  if (extension === '') return null
  return servers.find((server) => server.extensions.includes(extension)) ?? null
}

/** What the settings screen shows for one server, and what the chip counts. */
export interface LspServerState {
  id: string
  label: string
  /** A root file for this server exists in the workspace. */
  plausible: boolean
  /** The binary resolves on PATH. */
  installed: boolean
  /** The workspace has not switched this one off. */
  enabled: boolean
  /** The reader has an opinion about this server specifically, rather than
   *  inheriting the workspace switch. What keeps a server they turned off
   *  listed, so they can turn it back on. */
  explicit?: boolean
  /** Set once a process is up. */
  running?: boolean
  /** Set when the last attempt to use it failed. */
  degraded?: boolean
  install: string
}

/** A workspace's LSP settings. Absent means off, which is the default: a
 *  repository with no typed code gains nothing from a background daemon. */
export interface WorkspaceLsp {
  on: boolean
  /** Per-server switches. A server absent here is on when LSP is on. */
  servers?: Record<string, boolean>
}

export function lspEnabledFor(settings: WorkspaceLsp | undefined, serverId: string): boolean {
  if (!settings?.on) return false
  return settings.servers?.[serverId] !== false
}

/** The status bar's summary. Kept here so main and the renderer cannot drift. */
export function lspChip(states: readonly LspServerState[]): string | null {
  const enabled = states.filter((state) => state.enabled)
  if (enabled.length === 0) return null

  const running = enabled.filter((state) => state.running).length
  const degraded = enabled.some((state) => state.degraded)
  if (running === 0) return degraded ? 'lsp !' : 'lsp'
  return degraded ? `lsp ${running}!` : `lsp ${running}`
}
