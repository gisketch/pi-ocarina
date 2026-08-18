/** Opening a thread, and taking ownership of a session.
 *
 *  Lifted out of the driver because it is a workflow over the driver's
 *  collaborators rather than anything about the driver itself: every line here
 *  is about replay, adoption and the accounting that has to follow them. The
 *  driver keeps the collaborators; this keeps the sequence. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { HookPoint } from '../../shared/config-file'
import type { EmitEvent } from '../../shared/protocol'
import type { AgentFleet } from './agent-fleet'
import type { ChangeLog } from './change-log'
import type { ModelControl } from './model-control'
import { PiTranslator } from './pi-translate'
import { emitUsage, replayAndCharge } from './session-report'
import { subscribeSession } from './session-events'
import type { SessionFactory } from './session-factory'
import type { SteerQueue } from './steering'
import type { ThreadRegistry } from './thread-registry'
import type { WorkspaceService } from './workspaces'

export interface OpenDeps {
  emit: EmitEvent
  threads: ThreadRegistry
  fleet: AgentFleet
  models: ModelControl
  sessions: SessionFactory
  workspaces: WorkspaceService
  changes: ChangeLog
  steers: SteerQueue
  /** The approval gate's verdict for one call, consumed on read. Passed as a
   *  function rather than the gate itself: this is the only thing opening a
   *  thread needs from it. */
  takeBlocked: (toolCallId: string) => boolean
  /** Whether a path is one this app staged — a pasted screenshot's temporary
   *  file. What lets the ledger draw a picture the agent read from it. */
  staged: (path: string) => boolean
  /** Runs the reader's hooks for a point. Absent means this app has none
   *  configured, which is the ordinary case. */
  hooks?: (point: HookPoint, threadId: string) => Promise<unknown>
}

/** Reopens a thread: its history is replayed as events before the live session
 *  is attached, so watching a thread and returning to it look the same. */
export async function openThread(deps: OpenDeps, threadId: string): Promise<void> {
  // Already open in this process. Two different callers land here and both
  // need the same answer.
  //
  // One is a thread the renderer just created: it subscribes only once
  // `createThread` has returned, so the model and usage announced while the
  // session was being adopted reached nobody.
  //
  // The other is a renderer that reloaded. Main keeps its sessions across a
  // window reload, so every thread is still open here while the renderer has
  // just lost everything it knew — and replying with only a model name left
  // it showing empty columns until the whole app was restarted.
  //
  // Replaying is right for both: a freshly created thread has no history, so
  // it costs nothing there.
  const open = deps.threads.find(threadId)
  if (open) {
    replayAndCharge(
      deps.emit,
      threadId,
      open.session.sessionManager.buildContextEntries(),
      deps.fleet,
    )
    // Replay ends by stating the thread from its history, which cannot know
    // about a turn that is still streaming — it would report `done` over a
    // turn still being written. Only this side knows, so it says so.
    if (open.session.isStreaming) deps.emit(threadId, { kind: 'thread-state', state: 'running' })
    deps.models.announce(threadId, open.session, deps.emit)
    emitUsage(deps.emit, threadId, open.session, deps.fleet.spentIn(threadId))
    return
  }

  const { SessionManager } = await deps.sessions.load()
  const location = await deps.workspaces.locate(threadId)
  const { path } = location
  // A thread whose worktree has been removed still has its transcript, and
  // must still open — in the workspace's own folder, since pi needs a
  // directory that is there. It stops being isolated at that moment, which is
  // what `branch` coming back null says.
  const { cwd, branch } = deps.workspaces.openableCwd(location)

  const sessionManager = SessionManager.open(path)
  // The active branch, not every entry in the file: a session that has been
  // rewound holds abandoned branches too, and replaying those would show the
  // user a conversation that never happened.
  replayAndCharge(deps.emit, threadId, sessionManager.buildContextEntries(), deps.fleet)

  // The thread id is already known here, unlike on creation.
  const workspaceId = deps.workspaces.idForPath(cwd)
  const session = await deps.sessions.open(cwd, workspaceId, sessionManager, threadId)
  // `locate` filled the branch in from the listing, so a reopened thread
  // keeps the tree it was created in across a restart — unless that tree is
  // gone, in which case `openableCwd` has already said so.
  adoptSession(deps, session, cwd, branch)
}

/** Takes ownership of a session: wires its events, and files it under pi's own
 *  session id so the thread survives a relaunch. */
export function adoptSession(
  deps: OpenDeps,
  session: AgentSession,
  cwd: string,
  branch: string | null = null,
): string {
  const threadId = session.sessionId
  const translator = new PiTranslator(
    () => session.getSessionStats().contextUsage?.contextWindow,
    (toolCallId) => deps.takeBlocked(toolCallId),
  )
  const unsubscribe = subscribeSession({
    session,
    threadId,
    cwd,
    translator,
    emit: deps.emit,
    changes: deps.changes,
    steers: deps.steers,
    spent: () => deps.fleet.spentIn(threadId),
    staged: deps.staged,
    hooks: deps.hooks,
  })

  deps.threads.add(threadId, { session, unsubscribe, translator, prompts: 0 })
  deps.models.announce(threadId, deps.threads.find(threadId)?.session, deps.emit)
  // A reopened thread carries its whole history's accounting; without this
  // the meter would read zero until the thread's next turn ended.
  emitUsage(deps.emit, threadId, session, deps.fleet.spentIn(threadId))
  if (session.sessionFile) {
    deps.workspaces.remember(threadId, { path: session.sessionFile, cwd, branch })
  }
  return threadId
}
