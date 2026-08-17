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

/** Shell syntax that lets one approved-looking command carry another.
 *
 *  `cd /tmp && rm -rf *` starts with `cd`, so keying a rule on the first word
 *  would turn "always allow cd" into "always allow anything after a cd". */
const COMPOUND = /[;&|`$(){}<>\n]/

/** What "always allow" remembers.
 *
 *  For file tools the rule is the tool itself ("always let it write here").
 *  For bash it is the program being run, never `bash` outright — approving
 *  `pnpm install` must not permit every future shell command. A command that
 *  chains or substitutes gets a rule matching that exact command and nothing
 *  else, because its first word does not describe what it actually does. */
export function ruleKey(toolName: string, input: unknown): string {
  if (toolName !== 'bash') return toolName

  const raw = (input as { command?: unknown })?.command
  const command = typeof raw === 'string' ? raw.trim() : ''
  if (!command) return 'bash:?'

  if (COMPOUND.test(command)) return `bash=${command}`
  return `bash:${command.split(/\s+/)[0]}`
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
  /** pi's id for the call being gated. Kept so a blocked call can be reported
   *  as `denied` rather than as a generic failure — pi only ever says
   *  `isError`, and "the user said no" is not the same as "the tool broke". */
  toolCallId?: string
  /** Set when a child agent is the one asking.
   *
   *  A card that says only "write auth.ts?" is unanswerable while four children
   *  are running: the reader has to know which of them wants it before they can
   *  decide. */
  agent?: { name: string; role: string }
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
  toolCallId?: string
  settle: (verdict: ApprovalVerdict) => void
}

/** Decides whether a tool call may run, asking the user when no rule covers it.
 *
 *  Enforcement lives here in main, never in the renderer: the renderer is a
 *  view, and a view that could be raced or reloaded is not a safe place to keep
 *  a policy that governs writing to someone's disk. */
export class ApprovalGate {
  #pending = new Map<string, Pending>()
  #blocked = new Set<string>()
  #counter = 0

  readonly #emit: (threadId: string, event: UiEvent) => void
  readonly #rules: ApprovalRules

  constructor(emit: (threadId: string, event: UiEvent) => void, rules: ApprovalRules) {
    this.#emit = emit
    this.#rules = rules
  }

  async request({
    threadId,
    workspaceId,
    toolName,
    input,
    toolCallId,
    agent,
  }: ApprovalRequest): Promise<ApprovalVerdict> {
    if (!needsApproval(toolName)) return { blocked: false }
    if (this.#rules.hasApproval(workspaceId, ruleKey(toolName, input))) return { blocked: false }

    this.#counter += 1
    const id = `approve-${this.#counter}`

    this.#emit(threadId, {
      kind: 'approve',
      id,
      // No note: the command line already says what is about to happen, and
      // the workspace id is a uuid that would mean nothing to the reader. A
      // child is the one thing worth naming — see `ApprovalRequest.agent`.
      command: describeCall(toolName, input),
      ...(agent ? { agent } : {}),
    })

    return new Promise<ApprovalVerdict>((resolve) => {
      this.#pending.set(id, { threadId, workspaceId, toolName, input, toolCallId, settle: resolve })
    })
  }

  /** Whether this call was stopped by the gate. Consumed on read: a tool call
   *  ends exactly once, so nothing is left behind to leak. */
  takeBlocked(toolCallId: string): boolean {
    return this.#blocked.delete(toolCallId)
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

    if (outcome === 'deny') {
      this.#block(pending, 'denied by the user')
      return
    }
    pending.settle({ blocked: false })
  }

  /** Releases anything still waiting, denying rather than hanging the agent. */
  abandon(threadId: string): void {
    for (const [id, pending] of [...this.#pending]) {
      if (pending.threadId !== threadId) continue
      this.#pending.delete(id)
      this.#block(pending, 'the thread closed before it was answered')
    }
  }

  #block(pending: Pending, reason: string): void {
    if (pending.toolCallId) this.#blocked.add(pending.toolCallId)
    pending.settle({ blocked: true, reason })
  }

  get pendingCount(): number {
    return this.#pending.size
  }
}
