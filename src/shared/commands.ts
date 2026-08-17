/** Every command the UI can issue, with its parameter and result shapes.
 *
 *  Split from `protocol.ts` so the events flowing up and the commands flowing
 *  down are two files rather than one long one. `protocol.ts` re-exports these,
 *  so nothing that imports them had to move. */

import type {
  ApprovalOutcome,
  AskAnswer,
  AttachmentRef,
  ReasoningLevel,
} from './vocabulary'
import type { GitStatus } from './git-protocol'
import type {
  ChangedFile,
  ModelSummary,
  SearchHit,
  ThreadSummary,
  WorkspaceSummary,
} from './protocol'


/** Commands the UI can issue, with their parameter and result shapes. */
export interface SessionCommands {
  listWorkspaces: { params: Record<string, never>; result: { workspaces: WorkspaceSummary[] } }
  pinWorkspace: { params: { path: string }; result: { workspace: WorkspaceSummary } }
  unpinWorkspace: { params: { workspaceId: string }; result: { ok: true } }
  listThreads: { params: { workspaceId: string }; result: { threads: ThreadSummary[] } }
  /** `worktree` runs the thread in its own checkout on a new branch, made
   *  before the session starts — pi is given a working directory once, so this
   *  cannot be decided later. A failure rejects, leaving no thread behind. */
  createThread: {
    params: { workspaceId: string; title?: string; worktree?: { branch: string } }
    result: { threadId: string }
  }
  openThread: { params: { threadId: string }; result: { ok: true } }
  /** Hides a thread from its workspace's strip. The session file is untouched. */
  archiveThread: { params: { threadId: string }; result: { ok: true } }
  /** Brings a closed thread back — what jumping to it from search does. */
  unarchiveThread: { params: { threadId: string }; result: { ok: true } }
  prompt: {
    params: { threadId: string; text: string; attachments?: AttachmentRef[] }
    result: { ok: true }
  }
  steer: { params: { threadId: string; text: string }; result: { steerId: string } }
  cancelQueuedSteer: { params: { threadId: string; steerId: string }; result: { ok: true } }
  /** Every answer at once. Never one question at a time: a model handed answer
   *  one while the reader is still on question two is acting on half a
   *  decision. */
  answerAsk: {
    params: { threadId: string; askId: string; answers: AskAnswer[] }
    result: { ok: true }
  }
  resolveApproval: {
    params: { threadId: string; approvalId: string; outcome: ApprovalOutcome }
    result: { ok: true }
  }
  listApprovalRules: { params: { workspaceId: string }; result: { rules: string[] } }
  revokeApprovalRule: { params: { workspaceId: string; rule: string }; result: { ok: true } }
  cancelTurn: { params: { threadId: string }; result: { ok: true } }
  /** Stops one child agent. Its siblings keep running, and the turn stays open
   *  — that is the difference between this and `cancelTurn`. */
  cancelAgent: { params: { threadId: string; agentId: string }; result: { ok: boolean } }
  retryTurn: { params: { threadId: string }; result: { ok: true } }
  restoreCheckpoint: {
    params: { threadId: string; checkpointId: string }
    result: { threadId: string }
  }
  compact: { params: { threadId: string }; result: { ok: true } }
  /** Paths the @-mention picker offers, relative to the workspace. */
  listFiles: { params: { workspaceId: string }; result: { files: string[] } }
  /** Searches thread titles and transcripts. `complete` is false when the time
   *  budget ran out — the result then says so rather than implying it saw
   *  every thread. */
  searchThreads: {
    params: { query: string }
    result: { hits: SearchHit[]; complete: boolean }
  }
  /** Every file this thread changed, and the change as one diff each.
   *
   *  The span is the thread's whole life: the file as it was before the thread
   *  first touched it, against the file as it is now. The ledger answers the
   *  other question — what each call did — and both come from the same
   *  snapshots through the same diff, so the two cannot disagree. */
  listChanges: { params: { threadId: string }; result: { files: ChangedFile[] } }
  /** What removing this thread's worktree would cost, or null when it has none.
   *  `commits` counts commits on its branch and nowhere else. */
  threadWorktree: {
    params: { threadId: string }
    result: { worktree: { branch: string; path: string; dirty: number; commits: number } | null }
  }
  /** Removes a thread's worktree. Refuses one holding commits outright — the
   *  commits are the work — and a dirty one unless `force` says the reader was
   *  asked and answered. */
  removeThreadWorktree: {
    params: { threadId: string; force?: boolean }
    result: { ok: boolean; reason?: string }
  }
  /** Every worktree this app made under a workspace, and what each holds. */
  listWorktrees: {
    params: { workspaceId: string }
    result: { worktrees: { branch: string; path: string; dirty: number; commits: number }[] }
  }
  /** Removes one of them by path. Same three rules the close path uses. */
  removeWorktree: {
    params: { workspaceId: string; path: string; force?: boolean }
    result: { ok: boolean; reason?: string }
  }
  /** The git state of the checkout a thread runs in, or null when the thread
   *  is not isolated — the workspace's own state is already published on the
   *  git channel, and answering with it here would let the two disagree. */
  threadGit: { params: { threadId: string }; result: { status: GitStatus | null } }
  listModels: { params: Record<string, never>; result: { models: ModelSummary[] } }
  setModel: {
    params: { threadId: string; provider: string; model: string }
    result: { ok: true }
  }
  setReasoning: { params: { threadId: string; reasoning: ReasoningLevel }; result: { ok: true } }
}

export type CommandName = keyof SessionCommands
export type CommandParams<N extends CommandName> = SessionCommands[N]['params']
export type CommandResult<N extends CommandName> = SessionCommands[N]['result']
