import type { CommandName, CommandParams } from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'
import type { ModelControl } from './model-control'
import { searchThreads } from './search'
import type { WorkspaceService } from './workspaces'

/** Read-only commands about a workspace, rather than about a thread.
 *
 *  These need no open session, so they answer before the driver's thread
 *  dispatch is reached — and keeping them here leaves that dispatch about the
 *  thing it is actually for. */
export class WorkspaceQueries {
  readonly #workspaces: WorkspaceService
  readonly #catalog: CatalogStore
  readonly #models: ModelControl
  readonly #onUnpin: ((workspaceId: string) => void) | undefined

  constructor(
    workspaces: WorkspaceService,
    catalog: CatalogStore,
    models: ModelControl,
    onUnpin?: (workspaceId: string) => void,
  ) {
    this.#workspaces = workspaces
    this.#catalog = catalog
    this.#models = models
    this.#onUnpin = onUnpin
  }

  /** The answer, or null when this is not a workspace command. Wrapped rather
   *  than returned bare so `null` stays distinguishable from a command whose
   *  own answer is falsy. */
  async handle<N extends CommandName>(
    name: N,
    params: CommandParams<N>,
  ): Promise<{ result: unknown } | null> {
    switch (name) {
      case 'listWorkspaces':
        return { result: { workspaces: this.#workspaces.list() } }

      case 'pinWorkspace': {
        const { path } = params as CommandParams<'pinWorkspace'>
        return { result: { workspace: await this.#workspaces.pin(path) } }
      }

      case 'unpinWorkspace': {
        const { workspaceId } = params as CommandParams<'unpinWorkspace'>
        // A folder that is no longer pinned has no column to hold its shell,
        // and a shell nothing can reach is a process nobody can stop.
        this.#onUnpin?.(workspaceId)
        this.#workspaces.unpin(workspaceId)
        return { result: { ok: true } }
      }

      case 'listThreads': {
        const { workspaceId } = params as CommandParams<'listThreads'>
        return { result: { threads: await this.#workspaces.listThreads(workspaceId) } }
      }

      case 'listFiles': {
        const { workspaceId } = params as CommandParams<'listFiles'>
        return { result: { files: await this.#workspaces.listFiles(workspaceId) } }
      }

      case 'searchThreads': {
        const { query } = params as CommandParams<'searchThreads'>
        return { result: await searchThreads(this.#workspaces, query) }
      }

      case 'listModels':
        return { result: { models: await this.#models.list() } }

      case 'listApprovalRules': {
        const { workspaceId } = params as CommandParams<'listApprovalRules'>
        return { result: { rules: this.#catalog.listApprovals(workspaceId) } }
      }

      case 'revokeApprovalRule': {
        const { workspaceId, rule } = params as CommandParams<'revokeApprovalRule'>
        this.#catalog.removeApproval(workspaceId, rule)
        return { result: { ok: true } }
      }

      default:
        return null
    }
  }
}
