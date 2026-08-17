import {
  type CommandName,
  type CommandParams,
  type CommandResult,
  type EmitEvent,
  type SessionDriver,
} from '../../shared/protocol'
import { promptScript, type ScriptStep } from './fixture-stream'

export type Timer = (run: () => void, ms: number) => () => void

const defaultTimer: Timer = (run, ms) => {
  const handle = setTimeout(run, ms)
  return () => clearTimeout(handle)
}

/** Replays a scripted turn instead of talking to pi.
 *
 *  Its job is to make the seam real and exercisable before the pi adapter
 *  exists, so the renderer, transport, and reducer can all be built and tested
 *  against a stream that behaves like the real one. */
export class StubDriver implements SessionDriver {
  readonly kind = 'stub'

  #threads = 0
  #cancels = new Map<string, (() => void)[]>()

  readonly #emit: EmitEvent
  readonly #timer: Timer

  constructor(emit: EmitEvent, timer: Timer = defaultTimer) {
    this.#emit = emit
    this.#timer = timer
  }

  async execute<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<CommandResult<N>> {
    switch (name) {
      case 'createThread': {
        this.#threads += 1
        const threadId = `stub-${this.#threads}`
        return { threadId } as CommandResult<N>
      }

      case 'prompt': {
        const { threadId, text } = params as CommandParams<'prompt'>
        this.#play(threadId, promptScript(text))
        return { ok: true } as CommandResult<N>
      }

      case 'cancelTurn': {
        const { threadId } = params as CommandParams<'cancelTurn'>
        this.#stop(threadId)
        this.#emit(threadId, { kind: 'thread-state', state: 'idle' })
        return { ok: true } as CommandResult<N>
      }

      case 'restoreCheckpoint': {
        const { threadId } = params as CommandParams<'restoreCheckpoint'>
        return { threadId } as CommandResult<N>
      }

      case 'steer': {
        const { threadId, text } = params as CommandParams<'steer'>
        const steerId = `steer-${Date.now()}`
        this.#emit(threadId, { kind: 'steer-queued', id: steerId, text })
        return { steerId } as CommandResult<N>
      }

      case 'listWorktrees':
        return { worktrees: [] } as CommandResult<N>

      case 'threadGit':
        // The stub has no repository behind it. Null is what a thread that is
        // not isolated answers, which is every thread here.
        return { status: null } as CommandResult<N>

      case 'listChanges':
        // The stub changes no files, and says so — the default `{ ok: true }`
        // would hand the viewer a result with no `files` in it.
        return { files: [] } as CommandResult<N>

      default:
        // Every other command is accepted and does nothing: the stub proves the
        // shape of the seam, not the behaviour behind it.
        return { ok: true } as CommandResult<N>
    }
  }

  async dispose(): Promise<void> {
    for (const threadId of [...this.#cancels.keys()]) this.#stop(threadId)
  }

  #play(threadId: string, steps: ScriptStep[]): void {
    let elapsed = 0
    const cancels: (() => void)[] = []

    for (const step of steps) {
      elapsed += step.afterMs
      cancels.push(this.#timer(() => this.#emit(threadId, step.event), elapsed))
    }

    this.#stop(threadId)
    this.#cancels.set(threadId, cancels)
  }

  #stop(threadId: string): void {
    for (const cancel of this.#cancels.get(threadId) ?? []) cancel()
    this.#cancels.delete(threadId)
  }
}
