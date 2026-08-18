import type { ThreadId } from '../../shared/thread-id'
import { listWorkspaceFiles } from './files'
import { stat } from 'node:fs/promises'
import type { ThreadSummary, WorkspaceSummary } from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { worktreeDirName } from '../../shared/branch-name'
import {
  addWorktree,
  listWorktrees,
  repoOfWorktree,
  samePath,
  worktreeRoot,
} from '../git/worktree'

export type Sdk = typeof import('@earendil-works/pi-coding-agent')

/** Where a thread's transcript lives. */
export interface ThreadLocation {
  path: string
  cwd: string
  /** The branch of the worktree `cwd` is, or null when it is the workspace's
   *  own directory. */
  branch?: string | null
}

/** Pinned folders and the threads inside them.
 *
 *  Threads are read from pi's own session store rather than tracked separately,
 *  so a session started by the `pi` CLI in a pinned folder simply appears, and
 *  the app can never disagree with pi about what exists. */
export class WorkspaceService {
  readonly #store: CatalogStore
  readonly #load: () => Promise<Sdk>

  /** Thread id → file, refreshed whenever threads are listed. */
  #located = new Map<string, ThreadLocation>()

  constructor(store: CatalogStore, load: () => Promise<Sdk>) {
    this.#store = store
    this.#load = load
  }

  list(): WorkspaceSummary[] {
    return this.#store.snapshot().workspaces
  }

  async pin(path: string): Promise<WorkspaceSummary> {
    const info = await stat(path).catch(() => null)
    if (!info?.isDirectory()) throw new Error(`not a folder: ${path}`)
    return this.#store.pin(path)
  }

  unpin(workspaceId: string): void {
    this.#store.unpin(workspaceId)
  }

  pathOf(workspaceId: string): string {
    const workspace = this.#store.workspace(workspaceId)
    if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`)
    return workspace.path
  }

  /** Where a new thread's session should run.
   *
   *  With no worktree asked for, that is the workspace itself. With one, the
   *  checkout is made here — before any session exists — so a failure is a
   *  failed creation rather than a thread quietly running in the wrong tree. */
  async cwdForNewThread(
    workspaceId: string,
    worktree?: { branch: string },
  ): Promise<{ cwd: string; branch: string | null }> {
    const root = this.pathOf(workspaceId)
    if (!worktree) return { cwd: root, branch: null }

    return { cwd: await addWorktree(root, worktree.branch), branch: worktree.branch }
  }

  /** Every checkout a workspace's threads can live in: the workspace itself,
   *  and each worktree this app made under it. */
  async #trees(workspaceId: string): Promise<{ cwd: string; branch: string | null }[]> {
    const root = this.pathOf(workspaceId)
    const trees = await listWorktrees(root).catch(() => [])
    const ours = trees.filter((tree) => {
      const owner = repoOfWorktree(tree.path)
      return owner !== null && samePath(owner, root)
    })

    // A checkout that has been removed still has sessions filed under its
    // directory, and a thread nobody can list is a thread history search has
    // lost. The directory is gone; the name it stood under is not.
    const retired = this.#store.listRetired(workspaceId).map((branch) => ({
      cwd: join(worktreeRoot(root), worktreeDirName(branch)),
      branch,
    }))

    return [
      { cwd: root, branch: null },
      ...retired,
      // Named the way this app names them, not the way git reports them. git
      // resolves symlinks; the sessions were started under the unresolved path,
      // and pi lists sessions by the directory string it was given.
      ...ours.map((tree) => ({
        cwd: join(worktreeRoot(root), basename(tree.path)),
        branch: tree.branch,
      })),
    ]
  }

  /** Paths the @-mention picker offers, relative to the workspace root. */
  async listFiles(workspaceId: string): Promise<string[]> {
    return listWorkspaceFiles(this.pathOf(workspaceId))
  }

  /** Which pinned workspace owns a folder. Falls back to the path itself so an
   *  approval rule is still scoped to something stable rather than to nothing. */
  idForPath(path: string): string {
    const workspaces = this.list()
    const exact = workspaces.find((workspace) => workspace.path === path)
    if (exact) return exact.id

    // A worktree belongs to the workspace that made it. Without this an
    // isolated thread would be archived and have its approvals recorded under
    // its own directory, so closing it would hide nothing and its rules would
    // be invisible to every other thread in the same repository.
    const repo = repoOfWorktree(path)
    const owner = repo === null ? undefined : workspaces.find((w) => samePath(w.path, repo))
    return owner?.id ?? path
  }

  /** The workspace's threads, newest first.
   *
   *  Threads the user closed are left out, because the strip is what "closed"
   *  means. `includeArchived` is for history search, which must still find them
   *  — closing a thread hides its column, it does not delete its history. */
  async listThreads(
    workspaceId: string,
    { includeArchived = false }: { includeArchived?: boolean } = {},
  ): Promise<ThreadSummary[]> {
    const { SessionManager } = await this.#load()
    // Every checkout, not only the workspace: pi lists sessions by working
    // directory, so an isolated thread's session lives under its worktree and
    // would be missing from its own workspace's strip after a restart.
    const trees = await this.#trees(workspaceId)

    const listed = await Promise.all(
      trees.map(async (tree) => {
        const sessions = await SessionManager.list(tree.cwd).catch(() => [])
        return sessions.map((session) => ({ session, branch: tree.branch, cwd: tree.cwd }))
      }),
    )

    // Every session is located, closed ones included: `locate` is how search
    // reads a transcript and how a closed thread is reopened, and a thread we
    // cannot find is a thread that cannot come back.
    for (const { session, branch, cwd } of listed.flat()) {
      this.#located.set(session.id, { path: session.path, cwd: session.cwd || cwd, branch })
    }

    const hidden = includeArchived ? [] : this.#store.listArchived(workspaceId)

    return listed
      .flat()
      .filter(({ session }) => !hidden.includes(session.id))
      .map(({ session, branch }) => ({
        // The one place main mints a thread id for the renderer. pi's session
        // id *is* the thread id; the brand exists so that on the other side
        // nothing but this and `createThread` can produce one.
        id: session.id as ThreadId,
        title: session.name ?? firstLine(session.firstMessage) ?? 'untitled',
        modified: session.modified.toISOString(),
        messageCount: session.messageCount,
        branch,
      }))
      .sort((a, b) => b.modified.localeCompare(a.modified))
  }

  /** Records, or forgets, that a thread is hidden from its workspace's strip.
   *
   *  The workspace comes from where the session file lives, since a thread only
   *  ever knows its own folder. A thread whose folder is no longer pinned has no
   *  strip to be hidden from, so there is nothing to record. */
  async setArchived(threadId: string, archived: boolean): Promise<void> {
    const location = await this.locate(threadId).catch(() => null)
    if (!location) return

    const workspaceId = this.idForPath(location.cwd)
    if (archived) this.#store.archive(workspaceId, threadId)
    else this.#store.unarchive(workspaceId, threadId)
  }

  /** Remembers a session created in this run, so it can be reopened without a
   *  disk scan. */
  remember(threadId: string, location: ThreadLocation): void {
    this.#located.set(threadId, location)
  }

  /** The working directory of a thread already seen, without the scan `locate`
   *  would do. A caller that only wants to shorten a path should not pay for a
   *  workspace walk to do it. */
  cwdOf(threadId: string): string | undefined {
    return this.#located.get(threadId)?.cwd
  }

  /** The branch a thread is isolated on, or null when it runs in the
   *  workspace's own directory. */
  branchOf(threadId: string): string | null {
    return this.#located.get(threadId)?.branch ?? null
  }

  /** Records that a checkout is gone, so its threads stay listed.
   *
   *  Takes the path it stood in rather than a workspace id, because the caller
   *  that removes a worktree knows where it was and not which workspace owns
   *  it. A path outside every pinned workspace is not recorded: there would be
   *  nothing to list it under. */
  retire(path: string, branch: string): void {
    const workspaceId = this.idForPath(path)
    if (!this.#store.workspace(workspaceId)) return
    this.#store.retire(workspaceId, branch)
  }

  /** Where a thread can actually be opened.
   *
   *  A thread whose worktree has been removed still has a transcript, and it
   *  can still be read — but pi needs a directory that exists to run in, so it
   *  is offered its workspace's own folder. It is no longer isolated, and the
   *  caller says so by passing the branch back as null. */
  openableCwd(location: ThreadLocation): { cwd: string; branch: string | null } {
    if (existsSync(location.cwd)) return { cwd: location.cwd, branch: location.branch ?? null }

    const workspaceId = this.idForPath(location.cwd)
    const fallback = this.#store.workspace(workspaceId)?.path
    return { cwd: fallback ?? location.cwd, branch: null }
  }

  /** Finds a thread, scanning pinned workspaces only if it has not been seen. */
  async locate(threadId: string): Promise<ThreadLocation> {
    const known = this.#located.get(threadId)
    if (known) return known

    for (const workspace of this.list()) {
      await this.listThreads(workspace.id)
      const found = this.#located.get(threadId)
      if (found) return found
    }
    throw new Error(`unknown thread: ${threadId}`)
  }
}

function firstLine(text: string | undefined): string | undefined {
  const line = text?.split('\n').find((candidate) => candidate.trim().length > 0)
  return line ? line.trim().slice(0, 80) : undefined
}
