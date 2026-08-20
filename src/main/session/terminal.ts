import { basename } from 'node:path'
import type { IPty } from 'node-pty'

/** Bytes are coalesced within this window rather than sent per read.
 *
 *  A build can emit thousands of tiny chunks; each one crossing IPC on its own
 *  would cost more in messages than in bytes. The window only defers bytes
 *  that arrive on the heels of a flush — the first chunk after quiet goes out
 *  on its own tick, because an idle keystroke's echo has nothing to coalesce
 *  with and waiting would only make typing feel slow. Matches the session
 *  batcher's window so terminal and thread updates land in the same frame. */
const FLUSH_MS = 16

/** How the shell is asked for. */
const DEFAULT_SHELL = '/bin/zsh'

export interface TerminalOptions {
  /** Where the pty's bytes go. One call per flush, already coalesced. */
  emit: (terminalId: string, data: string) => void
  /** The folder a workspace's shell starts in. */
  cwdOf: (workspaceId: string) => string
  /** Injected so tests never spawn a real shell. */
  spawn?: PtySpawn
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; name: string; cols: number; rows: number },
) => IPty

interface Terminal {
  pty: IPty
  shell: string
  workspaceId: string
  pending: string
  timer: ReturnType<typeof setTimeout> | null
  /** When bytes last went out; zero means quiet, so the next chunk leads. */
  lastFlush: number
}

/** Independently addressed login shells.
 *
 *  A pty is created when the user asks for one and dies when they close it or
 *  when the app does — it is not a daemon, and nothing survives a quit. */
export class TerminalService {
  readonly #terminals = new Map<string, Terminal>()
  /** Terminal ids whose shell is being spawned right now. */
  readonly #starting = new Set<string>()
  readonly #emit: TerminalOptions['emit']
  readonly #cwdOf: TerminalOptions['cwdOf']
  readonly #spawn: PtySpawn | undefined

  constructor({ emit, cwdOf, spawn }: TerminalOptions) {
    this.#emit = emit
    this.#cwdOf = cwdOf
    this.#spawn = spawn
    // The native import is slow enough that awaiting it inside the first
    // create blocks main under a `t`. Started here so it overlaps startup;
    // the rejection is swallowed because a module that fails to build must
    // not crash the app — create awaits the same cached promise and surfaces
    // the error to whoever actually asked for a shell.
    if (!spawn) void loadPty().catch(() => {})
  }

  /** Starts one terminal's shell, or does nothing if it is already running.
   *  Safe to call on every `t`, which is what makes the key idempotent. */
  async create(terminalId: string, workspaceId: string): Promise<void> {
    if (this.#starting.has(terminalId) || this.#terminals.has(terminalId)) return
    // Claimed before the await: loading the native module takes long enough
    // for a second `t` to arrive and spawn a shell nobody can reach.
    this.#starting.add(terminalId)

    try {
      await this.#spawnInto(terminalId, workspaceId)
    } finally {
      this.#starting.delete(terminalId)
    }
  }

  async #spawnInto(terminalId: string, workspaceId: string): Promise<void> {
    const spawn = this.#spawn ?? (await loadPty())
    const shell = process.env.SHELL ?? DEFAULT_SHELL
    // A login shell, so the user's aliases and PATH are the ones they expect
    // from their own terminal rather than whatever Electron inherited.
    const pty = spawn(shell, ['-l'], {
      cwd: this.#cwdOf(workspaceId),
      env: { ...process.env, TERM: 'xterm-256color' },
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
    })

    const terminal: Terminal = { pty, shell, workspaceId, pending: '', timer: null, lastFlush: 0 }
    this.#terminals.set(terminalId, terminal)

    pty.onData((data) => this.#buffer(terminalId, terminal, data))
    // A shell the user exited is gone; the column stays until they close it,
    // and asking for it again spawns a fresh one. Identity is checked because
    // a dying shell's exit can land after its replacement was created — and
    // forgetting by key alone would orphan the new one.
    pty.onExit(() => this.#forget(terminalId, terminal))
  }

  write(terminalId: string, data: string): void {
    // Not buffered: a keystroke delayed by a frame is a keystroke that feels
    // slow, and the volume going this direction is a person typing.
    this.#terminals.get(terminalId)?.pty.write(data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    try {
      this.#terminals.get(terminalId)?.pty.resize(cols, rows)
    } catch {
      // The pty died between the resize observer firing and this call.
    }
  }

  /** Whether the shell is running something other than itself.
   *
   *  This is what the close confirm asks about. node-pty reports the
   *  foreground process name; when it differs from the login shell, a command
   *  is running and closing the column would kill it. */
  busy(terminalId: string): boolean {
    const terminal = this.#terminals.get(terminalId)
    if (!terminal) return false

    try {
      // Verified on macOS with node-pty 1.1: this reports "zsh" at the prompt
      // and the command's own name while one runs in the foreground.
      //
      // Compared as whole names. A suffix test would call `sh` the shell,
      // because "/bin/zsh" ends with "sh" — and a running script would be
      // killed without the question being asked.
      const running = terminal.pty.process
      return Boolean(running) && basename(terminal.shell) !== running
    } catch {
      // Not knowing is not a reason to claim something is running.
      return false
    }
  }

  kill(terminalId: string): void {
    const terminal = this.#terminals.get(terminalId)
    if (!terminal) return

    this.#forget(terminalId, terminal)
    try {
      terminal.pty.kill()
    } catch {
      // Already gone, which is the outcome asked for.
    }
  }

  has(terminalId: string): boolean {
    return this.#terminals.has(terminalId)
  }

  killWorkspace(workspaceId: string): void {
    for (const [terminalId, terminal] of this.#terminals) {
      if (terminal.workspaceId === workspaceId) this.kill(terminalId)
    }
  }

  disposeAll(): void {
    for (const terminalId of [...this.#terminals.keys()]) this.kill(terminalId)
  }

  #buffer(terminalId: string, terminal: Terminal, data: string): void {
    terminal.pending += data
    if (terminal.timer) return

    // Nothing flushed within the window means nothing to coalesce with: an
    // idle keystroke's echo leaves on this tick instead of waiting out a
    // timer armed for chatter that never comes. Under spew the timer covers
    // only the remainder of the window, so batches keep the same cadence.
    const sinceFlush = Date.now() - terminal.lastFlush
    if (sinceFlush >= FLUSH_MS) {
      this.#flush(terminalId, terminal)
      return
    }

    terminal.timer = setTimeout(() => {
      terminal.timer = null
      this.#flush(terminalId, terminal)
    }, FLUSH_MS - sinceFlush)
  }

  #flush(terminalId: string, terminal: Terminal): void {
    terminal.lastFlush = Date.now()
    const flushed = terminal.pending
    terminal.pending = ''
    if (flushed) this.#emit(terminalId, flushed)
  }

  #forget(terminalId: string, terminal: Terminal): void {
    if (this.#terminals.get(terminalId) !== terminal) return
    if (terminal.timer) clearTimeout(terminal.timer)
    this.#terminals.delete(terminalId)
  }
}

let ptyLoad: Promise<PtySpawn> | undefined

/** Loaded outside app startup, like the pi SDK: a native module that fails to
 *  build must not stop the rest of the app from starting. Cached so the
 *  prewarm at construction and the await inside create share one import —
 *  and one failure, reported where a user can see it. */
function loadPty(): Promise<PtySpawn> {
  ptyLoad ??= import('node-pty').then((pty) => pty.spawn as unknown as PtySpawn)
  return ptyLoad
}
