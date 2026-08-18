import type { PermissionLevel } from '../../shared/permissions'
import type { ApprovalOutcome } from '../../shared/vocabulary'
import { autoAllows } from './auto-policy'
import { ruleVerdict } from './rule-policy'
import type { RuleEntry } from '../../shared/config-file'
import type { UiEvent } from '../../shared/protocol'
import { FETCH_TOOL } from './fetch-tool'
import { isWriteMethod, parseUrl } from '../web/fetch-page'

/** Tools that change something. Read-only tools never interrupt the user.
 *
 *  pi has no permission system of its own — its `tool_call` hook just lets a
 *  handler block a call — so what needs approval is this app's policy, and this
 *  set is that policy. */
const GATED: ReadonlySet<string> = new Set(['bash', 'write', 'edit'])

/** Whether this call needs a yes before it runs.
 *
 *  `fetch` is the one tool whose answer depends on its arguments rather than
 *  its name: reading a page changes nothing, and a `POST` changes something on
 *  a server this app does not own. Rather than invent a second consent
 *  mechanism for the web, the write methods come through this gate. */
export function needsApproval(toolName: string, input?: unknown): boolean {
  if (toolName === FETCH_TOOL) return isWriteMethod(methodOf(input))
  return GATED.has(toolName)
}

function methodOf(input: unknown): string {
  const raw = (input as { method?: unknown })?.method
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'GET'
}

function urlOf(input: unknown): string {
  const raw = (input as { url?: unknown })?.url
  return typeof raw === 'string' ? raw : ''
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
  // A yes to posting at one host is not a yes to posting at every host, so the
  // rule carries the method and the origin — never the whole URL, which would
  // make every path a separate question the user has already answered.
  if (toolName === FETCH_TOOL) {
    const url = parseUrl(urlOf(input))
    return `fetch:${methodOf(input).toUpperCase()}:${url ? url.origin : '?'}`
  }
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
  if (toolName === FETCH_TOOL) {
    const body = pick('body')
    // The body is the part that changes something on someone else's server, so
    // a card without it asks the reader to approve a request they cannot see.
    const said = body ? ` — ${body.length > 200 ? `${body.slice(0, 200)}…` : body}` : ''
    return `${methodOf(input).toUpperCase()} ${pick('url') ?? '?'}${said}`
  }
  const path = pick('path') ?? pick('file_path')
  return path ? `${toolName} ${path}` : toolName
}

/** Where the level in force comes from, and what counts as the workspace.
 *
 *  Separate from the rules because they answer different questions and one of
 *  them is new: rules widen a level, the policy chooses it. Optional at the
 *  gate, defaulting to `ask` — a test that says nothing about levels is a test
 *  about the behaviour this app had before them, and should keep passing. */
export interface ApprovalPolicy {
  /** The level this workspace runs at, its own or the global default. */
  levelFor(workspaceId: string): PermissionLevel
  /** The workspace's directory, which is the boundary `auto` measures against.
   *  Null when it is unknown — and an unknown boundary means `auto` cannot
   *  judge anything, so everything gated is asked about. */
  pathFor(workspaceId: string): string | null
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

/** What the gate does when nobody told it about levels: what it did before they
 *  existed. */
const ASK_ALWAYS: ApprovalPolicy = {
  levelFor: () => 'ask',
  pathFor: () => null,
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
  readonly #policy: ApprovalPolicy
  /** The reader's written rules. Supplied after construction: main reads their
   *  file once at launch, and a gate built before it simply has none. */
  #written: () => readonly RuleEntry[] = () => []

  /** Overrides set for one thread, for as long as the app is open.
   *
   *  Deliberately not stored. A window reopening days later at `full` because
   *  of a decision made once for one command is exactly the surprise the levels
   *  are meant to remove. */
  #threads = new Map<string, PermissionLevel>()

  constructor(
    emit: (threadId: string, event: UiEvent) => void,
    rules: ApprovalRules,
    policy: ApprovalPolicy = ASK_ALWAYS,
  ) {
    this.#emit = emit
    this.#rules = rules
    this.#policy = policy
  }

  /** Hands the gate the reader's rules. Called once, after main has read
   *  their configuration file. */
  useRules(written: () => readonly RuleEntry[]): void {
    this.#written = written
  }

  /** The level a thread runs at, and where it came from. */
  levelFor(threadId: string, workspaceId: string): PermissionLevel {
    return this.#threads.get(threadId) ?? this.#policy.levelFor(workspaceId)
  }

  threadLevel(threadId: string): PermissionLevel | undefined {
    return this.#threads.get(threadId)
  }

  /** Sets or clears one thread's override. Clearing returns it to its
   *  workspace's level. */
  setThreadLevel(threadId: string, level: PermissionLevel | undefined): void {
    if (level === undefined) this.#threads.delete(threadId)
    else this.#threads.set(threadId, level)
  }

  forgetThread(threadId: string): void {
    this.#threads.delete(threadId)
  }

  async request({
    threadId,
    workspaceId,
    toolName,
    input,
    toolCallId,
    agent,
  }: ApprovalRequest): Promise<ApprovalVerdict> {
    if (!needsApproval(toolName, input)) return { blocked: false }

    const level = this.levelFor(threadId, workspaceId)
    if (level === 'full') return { blocked: false }

    // A remembered yes comes before the level's own rule, because it is the one
    // decision in here the reader made themselves about this exact call.
    if (this.#rules.hasApproval(workspaceId, ruleKey(toolName, input))) return { blocked: false }

    // Then the reader's written rules. A deny here beats everything below it,
    // including `auto` — someone who wrote a deny wants the question asked.
    const written = ruleVerdict(this.#written(), toolName, input, this.#policy.pathFor(workspaceId))
    if (written === 'allow') return { blocked: false }

    if (level === 'auto' && written !== 'deny') {
      const cwd = this.#policy.pathFor(workspaceId)
      if (cwd !== null && autoAllows(toolName, input, cwd)) return { blocked: false }
    }

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
