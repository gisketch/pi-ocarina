import { session } from '../session'

/** The workspace file index the @-mention picker searches.
 *
 *  Cached per workspace: the walk touches every folder, and doing it on each
 *  `@` would put a filesystem crawl in front of a keystroke. Stale by design —
 *  a file created after the index was built will not appear until the workspace
 *  is reloaded, which is a fair trade for a picker that opens instantly. */
/** How long a walk's answer keeps re-walks at bay.
 *
 *  Long enough that reopening the picker while hunting for a file costs no
 *  crawl, short enough that a file the agent just wrote shows up on the next
 *  open after a pause. */
const REFRESH_TTL_MS = 30_000

class FileIndex {
  #indexes = $state.raw<Record<string, string[]>>({})
  #loading = new Set<string>()
  /** When each workspace's walk last answered, for the TTL below. */
  #walked = new Map<string, number>()
  /** Keyed by the list's identity, so a swapped index drops its old Set. */
  #sets = new WeakMap<string[], Set<string>>()

  files(workspaceId: string): string[] {
    return this.#indexes[workspaceId] ?? []
  }

  /** Membership, for the prose chips — a Set per workspace, rebuilt when the
   *  index is, because asking `includes` of fifty thousand paths per code
   *  span is how a transcript starts to lag. */
  contains(workspaceId: string, path: string): boolean {
    const files = this.#indexes[workspaceId]
    if (!files) return false
    let set = this.#sets.get(files)
    if (!set) {
      set = new Set(files)
      this.#sets.set(files, set)
    }
    return set.has(path)
  }

  /** Loads the index if it is not already there. Safe to call on every render. */
  ensure(workspaceId: string): void {
    if (workspaceId in this.#indexes) return
    this.refresh(workspaceId)
  }

  /** Whether a workspace's index has ever arrived — false only before the
   *  first walk answers, which is the one moment the picker shows a wait. */
  loaded(workspaceId: string): boolean {
    return workspaceId in this.#indexes
  }

  /** Re-walks the workspace behind whatever is already showing (spec D8).
   *
   *  Stale-while-revalidate: the cached list keeps serving, and the fresh one
   *  replaces it whole when the walk returns. The caller never waits — a walk
   *  must not stand in front of a keystroke.
   *
   *  Behind a TTL, because the picker calls this on every open: a crawl that
   *  just answered is not worth repeating for a reader flicking `␣f` between
   *  two files. The first walk always runs — nothing is served before it —
   *  and `force` is for the caller who knows the folder moved under it. */
  refresh(workspaceId: string, opts: { force?: boolean } = {}): void {
    if (this.#loading.has(workspaceId)) return
    const walked = this.#walked.get(workspaceId)
    if (!opts.force && walked !== undefined && Date.now() - walked < REFRESH_TTL_MS) return
    this.#loading.add(workspaceId)

    void session
      .invoke('listFiles', { workspaceId })
      .then(({ files }) => this.#store(workspaceId, files))
      .catch(() => {
        // No backend, or a folder that cannot be walked. The picker simply
        // finds nothing rather than the composer breaking — but a failed
        // re-walk keeps the cache it already had.
        if (!(workspaceId in this.#indexes)) this.#store(workspaceId, [])
      })
      .finally(() => this.#loading.delete(workspaceId))
  }

  /** Forgets an index, so a workspace can be re-walked after files change. */
  forget(workspaceId: string): void {
    const { [workspaceId]: _dropped, ...rest } = this.#indexes
    this.#indexes = rest
    this.#walked.delete(workspaceId)
  }

  #store(workspaceId: string, files: string[]): void {
    this.#indexes = { ...this.#indexes, [workspaceId]: files }
    this.#walked.set(workspaceId, Date.now())
  }
}

export const files = new FileIndex()
