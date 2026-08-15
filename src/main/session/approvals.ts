import type { ApprovalOutcome } from '../../shared/vocabulary'
import type { UiEvent } from '../../shared/protocol'

/** Tools that change something. Read-only tools never interrupt the user.
 *
 *  pi has no permission system of its own — its `tool_call` hook just lets a
 *  handler block a call — so what needs approval is this app's policy, and this
 *  set is that policy. */
const GATED: ReadonlySet<string> = new Set(['bash', 'write', 'edit'])

export function needsApproval(toolName: string): boolean {
  return GATED.has(toolName)
}

/** What "always allow" remembers.
 *
 *  For file tools the rule is the tool itself ("always let it write here").
 *  For bash it is the program being run, never the whole command: remembering
 *  `bash` outright would silently permit every future shell command in the
 *  workspace, which is not what someone approving `pnpm install` meant. */
export function ruleKey(toolName: string, input: unknown): string {
  if (toolName !== 'bash') return toolName

  const command = (input as { command?: unknown })?.command
  const program = typeof command === 'string' ? command.trim().split(/\s+/)[0] : ''
  return program ? `bash:${program}` : 'bash:?'
}

/** The line the approve card shows. */
export function describeCall(toolName: string, input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>
  const pick = (key: string): string | undefined =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined

  if (toolName === 'bash') return pick('command') ?? 'bash'
  const path = pick('path') ?? pick('file_path')
  return path ? `${toolName} ${path}` : toolName
}

/** Per-workspace "always allow" rules. Backed by the catalog. */
export interface ApprovalRules {
  hasApproval(workspaceId: string, key: string): boolean
  addApproval(workspaceId: string, key: string): void
  removeApproval(workspaceId: string, key: string): void
  listApprovals(workspaceId: string): string[]
}

export interface ApprovalRequest {
  threadId: string
  workspaceId: string
  toolName: string
  input: unknown
}

export interface ApprovalVerdict {
  blocked: boolean
  reason?: string
}

interface Pending {
  threadId: string
  workspaceId: string
  toolName: string
  input: unknown
  settle: (verdict: ApprovalVerdict) => void
}

/** Decides whether a tool call may run, asking the user when no rule covers it.
 *
 *  Enforcement lives here in main, never in the renderer: the renderer is a
 *  view, and a view that could be raced or reloaded is not a safe place to keep
 *  a policy that governs writing to someone's disk. */
export class ApprovalGate {
  #pending = new Map<string, Pending>()
  #counter = 0

  readonly #emit: (threadId: string, event: UiEvent) => void
  readonly #rules: ApprovalRules

  constructor(emit: (threadId: string, event: UiEvent) => void, rules: ApprovalRules) {
    this.#emit = emit
    this.#rules = rules
  }

  async request({ threadId, workspaceId, toolName, input }: ApprovalRequest): Promise<ApprovalVerdict> {
    if (!needsApproval(toolName)) return { blocked: false }
    if (this.#rules.hasApproval(workspaceId, ruleKey(toolName, input))) return { blocked: false }

    this.#counter += 1
    const id = `approve-${this.#counter}`

    this.#emit(threadId, {
      kind: 'approve',
      id,
      command: describeCall(toolName, input),
      note: toolName === 'bash' ? undefined : `${toolName} in ${workspaceId}`,
    })

    return new Promise<ApprovalVerdict>((resolve) => {
      this.#pending.set(id, { threadId, workspaceId, toolName, input, settle: resolve })
    })
  }

  /** Applies the user's answer and lets the waiting tool call continue. */
  resolve(approvalId: string, outcome: ApprovalOutcome): void {
    const pending = this.#pending.get(approvalId)
    if (!pending) return
    this.#pending.delete(approvalId)

    if (outcome === 'always') {
      this.#rules.addApproval(pending.workspaceId, ruleKey(pending.toolName, pending.input))
    }

    this.#emit(pending.threadId, { kind: 'approve-resolved', id: approvalId, outcome })
    pending.settle(
      outcome === 'deny' ? { blocked: true, reason: 'denied by the user' } : { blocked: false },
    )
  }

  /** Releases anything still waiting, denying rather than hanging the agent. */
  abandon(threadId: string): void {
    for (const [id, pending] of [...this.#pending]) {
      if (pending.threadId !== threadId) continue
      this.#pending.delete(id)
      pending.settle({ blocked: true, reason: 'the thread closed before it was answered' })
    }
  }

  get pendingCount(): number {
    return this.#pending.size
  }
}
