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
    if (workspaceId in this.#indexes || this.#loading.has(workspaceId)) return
    this.#loading.add(workspaceId)

    void session
      .invoke('listFiles', { workspaceId })
      .then(({ files }) => this.#store(workspaceId, files))
      .catch(() => {
        // No backend, or a folder that cannot be walked. The picker simply
        // finds nothing rather than the composer breaking.
        this.#store(workspaceId, [])
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
