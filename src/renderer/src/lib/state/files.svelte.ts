import { session } from '../session'

/** The workspace file index the @-mention picker searches.
 *
 *  Cached per workspace: the walk touches every folder, and doing it on each
 *  `@` would put a filesystem crawl in front of a keystroke. Stale by design —
 *  a file created after the index was built will not appear until the workspace
 *  is reloaded, which is a fair trade for a picker that opens instantly. */
class FileIndex {
  #indexes = $state.raw<Record<string, string[]>>({})
  #loading = new Set<string>()

  files(workspaceId: string): string[] {
    return this.#indexes[workspaceId] ?? []
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
   *  must not stand in front of a keystroke. */
  refresh(workspaceId: string): void {
    if (this.#loading.has(workspaceId)) return
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
  }

  #store(workspaceId: string, files: string[]): void {
    this.#indexes = { ...this.#indexes, [workspaceId]: files }
  }
}

export const files = new FileIndex()
