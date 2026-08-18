/** Hooks, run at a point in a turn's life and drawn in the ledger.
 *
 *  The rows are emitted straight into the thread rather than translated from a
 *  pi event, because pi never sees a hook. The app already has one grammar for
 *  "something happened during this turn"; a toast would be gone before the
 *  reader looked, and nowhere at all would make a formatter that silently did
 *  nothing indistinguishable from one that never ran. */

import type { HookEntry, HookPoint } from '../../shared/config-file'
import type { EmitEvent } from '../../shared/protocol'
import { hookFailed, hookSummary, runHook, type HookResult } from './hook-runner'

/** Binds a hook runner to one app's parts. What the driver hands to a thread's
 *  subscription, so the subscription knows nothing about where hooks come
 *  from. */
export function hookRunnerFor(deps: HookDeps) {
  return (point: HookPoint, threadId: string): Promise<HookResult[]> =>
    runHooksFor(point, threadId, deps)
}

export interface HookDeps {
  hooks: () => readonly HookEntry[]
  cwdOf: (threadId: string) => string | undefined
  emit: EmitEvent
}

let counter = 0

function rowId(): string {
  counter += 1
  return `hook-${counter}`
}

/** The command, shortened to what identifies it.
 *
 *  A row is scanned, not read. `pnpm test --reporter=dot --run` says the same
 *  thing as `pnpm test` to someone checking whether their tests ran. */
export function hookTarget(command: string): string {
  const said = command.trim()
  return said.length <= 48 ? said : `${said.slice(0, 47)}…`
}

function lines(output: string): { text: string }[] {
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((text) => ({ text }))
}

/** Runs every hook bound to a point, in order, and draws each one.
 *
 *  Sequential rather than parallel: two hooks on the same point usually depend
 *  on each other — format, then test — and a reader who wrote them in an order
 *  meant that order.
 *
 *  Never rejects. A hook that fails is a row that says so, and the turn is
 *  unaffected either way. */
export async function runHooksFor(
  point: HookPoint,
  threadId: string,
  deps: HookDeps,
): Promise<HookResult[]> {
  const wanted = deps.hooks().filter((hook) => hook.on === point)
  if (wanted.length === 0) return []

  const cwd = deps.cwdOf(threadId)
  if (cwd === undefined) return []

  const results: HookResult[] = []
  for (const hook of wanted) {
    const id = rowId()
    deps.emit(threadId, {
      kind: 'tool-start',
      id,
      tool: 'hook',
      target: hookTarget(hook.command),
      detail: point,
    })

    const result = await runHook(hook, { cwd })
    results.push(result)

    if (result.output !== '') {
      deps.emit(threadId, {
        kind: 'tool-body',
        id,
        body: {
          type: 'terminal',
          lines: lines(result.output),
          ...(hookFailed(result) ? { tone: 'error' as const } : {}),
        },
      })
    }

    deps.emit(threadId, {
      kind: 'tool-end',
      id,
      status: hookFailed(result) ? 'fail' : 'ok',
      meta: hookSummary(result),
    })
  }

  return results
}
