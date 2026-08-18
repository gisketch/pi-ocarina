/** Running the reader's hooks, and reporting what they did.
 *
 *  A hook observes. It cannot veto a turn, delay one, or change what the agent
 *  does — the moment it could, it would be approval policy, which is a separate
 *  capability with a separate shape.
 *
 *  Spawned without a shell. The command is a string out of a file, and handing
 *  it to `sh -c` would make every hook a place where a stray quote runs
 *  something nobody wrote. */

import { spawn } from 'node:child_process'
import type { HookEntry } from '../../shared/config-file'

/** How long a hook runs before it is killed.
 *
 *  Long enough for a formatter or a short test run, short enough that a hook
 *  that hangs does not hold a turn's footer open. A hook may name its own. */
export const DEFAULT_HOOK_TIMEOUT_MS = 30_000

/** How much of a hook's output is kept.
 *
 *  A row is read, not archived. A test runner that prints ten thousand lines
 *  has said what it needed to in the last few. */
export const MAX_HOOK_OUTPUT = 8_000

export interface HookResult {
  command: string
  /** Zero for success. `null` when the hook never ran to an exit — killed on
   *  timeout, or the binary was missing. */
  code: number | null
  output: string
  /** Set when the hook was killed for running too long. */
  timedOut?: boolean
  /** Set when the command could not be started at all. */
  failedToStart?: boolean
  ms: number
}

/** Splits a command into a program and its arguments.
 *
 *  Quotes are honoured so a path with a space works; nothing else is
 *  interpreted. No globbing, no substitution, no pipes — a hook that wants a
 *  shell writes a script and names the script. */
export function argsOf(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current !== '') parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current !== '') parts.push(current)
  return parts
}

export interface RunOptions {
  cwd: string
  now?: () => number
}

/** Runs one hook. Never rejects.
 *
 *  Every failure — a non-zero exit, a missing binary, a timeout — comes back as
 *  a result. A hook that could throw here would be a hook that can break the
 *  turn it was only supposed to watch. */
export function runHook(hook: HookEntry, options: RunOptions): Promise<HookResult> {
  const started = (options.now ?? Date.now)()
  const [program, ...args] = argsOf(hook.command)

  if (program === undefined) {
    return Promise.resolve({
      command: hook.command,
      code: null,
      output: 'no command',
      failedToStart: true,
      ms: 0,
    })
  }

  return new Promise((resolve) => {
    // Its own process group. Without it a killed hook leaves whatever it
    // started behind: `sh -c "pnpm test"` dies and the test runner keeps going,
    // holding the port or the file lock the next turn needs.
    const child = spawn(program, args, { cwd: options.cwd, shell: false, detached: true })
    let output = ''
    let done = false

    const finish = (result: Omit<HookResult, 'command' | 'ms'>): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({
        command: hook.command,
        ...result,
        ms: (options.now ?? Date.now)() - started,
      })
    }

    const take = (chunk: Buffer): void => {
      if (output.length >= MAX_HOOK_OUTPUT) return
      output += chunk.toString('utf8').slice(0, MAX_HOOK_OUTPUT - output.length)
    }

    child.stdout?.on('data', take)
    child.stderr?.on('data', take)

    const timer = setTimeout(() => {
      // The group, not the process: see `detached` above.
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        // Already gone between the timer firing and the signal.
      }
      finish({ code: null, output, timedOut: true })
    }, hook.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS)

    child.on('error', (cause: Error) => {
      finish({ code: null, output: cause.message, failedToStart: true })
    })

    child.on('close', (code) => {
      finish({ code, output })
    })
  })
}

/** What the row says after the hook's name. */
export function hookSummary(result: HookResult): string {
  if (result.failedToStart) return 'could not run'
  if (result.timedOut) return 'timed out'
  return result.code === 0 ? 'ok' : `exit ${String(result.code)}`
}

export function hookFailed(result: HookResult): boolean {
  return result.timedOut === true || result.failedToStart === true || result.code !== 0
}
