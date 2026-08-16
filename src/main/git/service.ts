import { execFile } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { GitStatus } from '../../shared/protocol'
import { parseStatus } from './porcelain'

const run = promisify(execFile)

/** How long a burst of `.git` writes is allowed to settle.
 *
 *  A single `git commit` touches the index, HEAD and a ref in quick
 *  succession. Reading status after each one would run git three times and
 *  publish two states nobody wanted to see. */
const SETTLE_MS = 120

/** Files under `.git` whose change can alter what the status bar shows.
 *
 *  `.git` is also where git writes objects, lock files and packs — thousands
 *  of events during a fetch, none of which change the summary. Matching on
 *  these prefixes is what keeps a big repo from re-running status all day. */
const INTERESTING = [
  'HEAD',
  'index',
  'refs',
  // Packed refs are refs too: after `git pack-refs`, a fetch moves the remote
  // branch here and nowhere under `refs/`, so ahead and behind change with no
  // other file touched.
  'packed-refs',
  'MERGE_HEAD',
  'ORIG_HEAD',
  'CHERRY_PICK_HEAD',
]

/** Git's own bookkeeping, and never a change in state.
 *
 *  This one matters more than it looks: reading status refreshes the index,
 *  which writes `index.lock`, which a watcher reads as a change, which reads
 *  status again. Measured at about eight git runs a second on an idle repo —
 *  a polling loop wearing an event-driven coat. `--no-optional-locks` below
 *  stops this app causing it; this stops any other git doing so. */
const BOOKKEEPING = '.lock'

/** What the service needs from the world. Injected so tests never touch git. */
export interface GitServiceOptions {
  /** Where a workspace lives. Null when it is no longer pinned. */
  pathOf: (workspaceId: string) => string | null
  /** Publishes a workspace's state. Called only when the state changed. */
  emit: (workspaceId: string, status: GitStatus | null) => void
  /** Runs `git status` in a folder. Null means "not a repository". */
  read?: (cwd: string) => Promise<GitStatus | null>
}

interface Watched {
  watcher: FSWatcher | null
  timer: ReturnType<typeof setTimeout> | null
  /** A status read is in flight; another request is waiting behind it. */
  running: boolean
  queued: boolean
  last: GitStatus | null
  /** Set once the first read has answered, so `null` can mean "not a repo"
   *  rather than "not read yet" and an unchanged answer is not re-published. */
  known: boolean
}

/** Per-workspace git status, refreshed by events rather than by a timer.
 *
 *  Three things ask for a refresh: a write under `.git`, the renderer after an
 *  agent finishes a tool call, and the renderer when a workspace is focused.
 *  Nothing polls, so an idle app runs no git at all. */
export class GitService {
  readonly #watched = new Map<string, Watched>()
  readonly #pathOf: GitServiceOptions['pathOf']
  readonly #emit: GitServiceOptions['emit']
  readonly #read: (cwd: string) => Promise<GitStatus | null>

  constructor({ pathOf, emit, read }: GitServiceOptions) {
    this.#pathOf = pathOf
    this.#emit = emit
    this.#read = read ?? readStatus
  }

  /** Asks for a workspace's state, starting to watch it on the first ask.
   *
   *  Safe to call as often as the UI likes: the debounce and the in-flight
   *  guard turn a burst into one git run. */
  refresh(workspaceId: string): void {
    const path = this.#pathOf(workspaceId)
    if (path === null) return

    const entry = this.#entry(workspaceId, path)
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      void this.#read1(workspaceId, path, entry)
    }, SETTLE_MS)
  }

  /** The last known state, for a window that opened after it was read. */
  statuses(): { workspaceId: string; status: GitStatus | null }[] {
    return [...this.#watched]
      .filter(([, entry]) => entry.known)
      .map(([workspaceId, entry]) => ({ workspaceId, status: entry.last }))
  }

  /** Stops watching a workspace — what unpinning it means here. */
  forget(workspaceId: string): void {
    const entry = this.#watched.get(workspaceId)
    if (!entry) return

    entry.watcher?.close()
    if (entry.timer) clearTimeout(entry.timer)
    this.#watched.delete(workspaceId)
  }

  disposeAll(): void {
    for (const workspaceId of [...this.#watched.keys()]) this.forget(workspaceId)
  }

  #entry(workspaceId: string, path: string): Watched {
    const existing = this.#watched.get(workspaceId)
    if (existing) return existing

    const entry: Watched = {
      watcher: null,
      timer: null,
      running: false,
      queued: false,
      last: null,
      known: false,
    }
    this.#watched.set(workspaceId, entry)
    entry.watcher = this.#startWatch(workspaceId, path)
    return entry
  }

  /** Watches `.git` for the writes that change a summary.
   *
   *  A folder that is not a repository has no `.git`, and watching throws; that
   *  is not a failure, it is the answer, so the status read still happens and
   *  reports "not a repo". */
  #startWatch(workspaceId: string, path: string): FSWatcher | null {
    try {
      const watcher = watch(join(path, '.git'), { recursive: true }, (_event, name) => {
        if (!name) return
        if (name.endsWith(BOOKKEEPING)) return
        if (!INTERESTING.some((prefix) => name.startsWith(prefix))) return
        this.refresh(workspaceId)
      })
      // A watcher on a folder that disappears must not take the app with it.
      watcher.on('error', () => watcher.close())
      return watcher
    } catch {
      return null
    }
  }

  async #read1(workspaceId: string, path: string, entry: Watched): Promise<void> {
    // One git process per workspace at a time. A second request that arrives
    // mid-read is remembered, not dropped: it may be about a change this read
    // started too early to see.
    if (entry.running) {
      entry.queued = true
      return
    }
    entry.running = true

    try {
      const status = await this.#read(path).catch(() => null)
      // A workspace unpinned mid-read has nothing left to publish about.
      if (!this.#watched.has(workspaceId)) return

      if (!entry.known || !same(entry.last, status)) {
        entry.known = true
        entry.last = status
        this.#emit(workspaceId, status)
      }
    } finally {
      entry.running = false
      if (entry.queued) {
        entry.queued = false
        void this.#read1(workspaceId, path, entry)
      }
    }
  }
}

function same(a: GitStatus | null, b: GitStatus | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.branch === b.branch &&
    a.detached === b.detached &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.added === b.added &&
    a.modified === b.modified &&
    a.deleted === b.deleted &&
    a.untracked === b.untracked &&
    a.conflicts === b.conflicts
  )
}

/** Runs git itself.
 *
 *  `--porcelain=v2 --branch` is the machine format git promises to keep
 *  stable. `--no-optional-locks` is git's own answer for a tool that reads
 *  status in the background: without it, reading refreshes the index on disk,
 *  and a watcher on `.git` then reports the read as a change.
 *
 *  `execFile` takes no shell, so a folder name can never be read as a
 *  command. */
export async function readStatus(cwd: string): Promise<GitStatus | null> {
  try {
    const { stdout } = await run('git', ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'], {
      cwd,
      // A pathological repo must not hold a status read open forever.
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
    return parseStatus(stdout)
  } catch {
    // Not a repository, git not installed, or the folder is gone. All three
    // mean the same thing to the chrome: show no git segments.
    return null
  }
}
