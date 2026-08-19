import { randomUUID } from 'node:crypto'
import type { ChatMode } from '../shared/chat-modes'
import { seedDefaults } from './catalog-seed'
import { deleteMode, modeFor, saveMode, setDefaultMode } from './catalog-modes'
import type { WorkspaceLsp } from '../shared/lsp'
import { isPermissionLevel, type PermissionLevel } from '../shared/permissions'
import type { AgentRole } from '../shared/vocabulary'
import { nameFor, voiceFor } from '../shared/workspace-identity'
import {
  defaultCatalog,
  parsePreferences,
  readCatalog,
  writeCatalog,
  type CatalogState,
  type Preferences,
  type WorkspaceEntry,
} from './catalog'

/** Owns the catalog file.
 *
 *  Main is the only writer. The renderer sends its position and nothing else,
 *  so a layout save can never clobber the pinned workspaces that main added —
 *  which is exactly what happened when both sides wrote the whole document. */
export class CatalogStore {
  #state: CatalogState = defaultCatalog()
  #warning: string | undefined
  #writing: Promise<void> = Promise.resolve()

  readonly #file: string

  constructor(file: string) {
    this.#file = file
  }

  async load(): Promise<{ state: CatalogState; warning?: string }> {
    const { state, warning } = await readCatalog(this.#file)
    this.#state = state
    this.#warning = warning
    // Here rather than at the call site: every path that opens a catalog wants
    // the shipped roles present, and a second caller that forgot to seed would
    // report an app with no roles at all.
    this.seedOnce()
    return { state: this.snapshot(), warning }
  }

  snapshot(): CatalogState {
    return {
      ...this.#state,
      workspaces: [...this.#state.workspaces],
      focus: [...this.#state.focus],
      approvals: structuredClone(this.#state.approvals),
      archived: structuredClone(this.#state.archived),
      retired: structuredClone(this.#state.retired),
      order: structuredClone(this.#state.order),
      panes: structuredClone(this.#state.panes ?? {}),
      roles: structuredClone(this.#state.roles),
      namePool: [...this.#state.namePool],
    }
  }

  /** Hides a thread from its workspace's strip. The session file is untouched —
   *  closing a thread is not deleting its history. */
  archive(workspaceId: string, threadId: string): void {
    const existing = this.#state.archived[workspaceId] ?? []
    if (existing.includes(threadId)) return

    this.#state.archived[workspaceId] = [...existing, threadId]
    this.#persist()
  }

  /** Brings a closed thread back, which is what jumping to it from search does. */
  unarchive(workspaceId: string, threadId: string): void {
    const existing = this.#state.archived[workspaceId]
    if (!existing?.includes(threadId)) return

    const remaining = existing.filter((candidate) => candidate !== threadId)
    if (remaining.length > 0) this.#state.archived[workspaceId] = remaining
    else delete this.#state.archived[workspaceId]
    this.#persist()
  }

  listArchived(workspaceId: string): string[] {
    return [...(this.#state.archived[workspaceId] ?? [])]
  }

  /** Records that a branch's worktree is gone, so its threads stay findable.
   *
   *  The branch, not the directory: the directory's name is derived from it,
   *  and a workspace that moves on disk would take a stored path with it. */
  retire(workspaceId: string, branch: string): void {
    const existing = this.#state.retired[workspaceId] ?? []
    if (existing.includes(branch)) return

    this.#state.retired[workspaceId] = [...existing, branch]
    this.#persist()
  }

  listRetired(workspaceId: string): string[] {
    return [...(this.#state.retired[workspaceId] ?? [])]
  }

  /** The level a workspace runs at: its own, or the global default. */
  levelFor(workspaceId: string): PermissionLevel {
    const own = this.#state.workspaces.find((entry) => entry.id === workspaceId)?.permission
    return own ?? this.#state.preferences.defaultPermission
  }

  /** The level in force and where it came from, for the screen that shows it. */
  describeLevel(workspaceId: string): {
    level: PermissionLevel
    workspace?: PermissionLevel
    global: PermissionLevel
  } {
    const own = this.#state.workspaces.find((entry) => entry.id === workspaceId)?.permission
    const global = this.#state.preferences.defaultPermission
    return { level: own ?? global, global, ...(own !== undefined ? { workspace: own } : {}) }
  }

  /** The workspace's directory — the boundary `auto` measures against. */
  pathFor(workspaceId: string): string | null {
    return this.#state.workspaces.find((entry) => entry.id === workspaceId)?.path ?? null
  }

  /** Sets or clears a workspace's own level. Clearing returns it to the global
   *  default, which is where most workspaces should be. */
  setLevel(workspaceId: string, level: PermissionLevel | undefined): void {
    const entry = this.#state.workspaces.find((candidate) => candidate.id === workspaceId)
    if (!entry) return
    if (level !== undefined && !isPermissionLevel(level)) return

    if (level === undefined) delete entry.permission
    else entry.permission = level
    this.#persist()
  }

  hasApproval(workspaceId: string, key: string): boolean {
    return this.#state.approvals[workspaceId]?.includes(key) ?? false
  }

  addApproval(workspaceId: string, key: string): void {
    const existing = this.#state.approvals[workspaceId] ?? []
    if (existing.includes(key)) return

    this.#state.approvals[workspaceId] = [...existing, key]
    this.#persist()
  }

  removeApproval(workspaceId: string, key: string): void {
    const existing = this.#state.approvals[workspaceId]
    if (!existing?.includes(key)) return

    const remaining = existing.filter((candidate) => candidate !== key)
    if (remaining.length > 0) this.#state.approvals[workspaceId] = remaining
    else delete this.#state.approvals[workspaceId]
    this.#persist()
  }

  listApprovals(workspaceId: string): string[] {
    return [...(this.#state.approvals[workspaceId] ?? [])]
  }

  /** Writes the shipped roles and names, once and only once.
   *
   *  Called on load. The marker is what makes it once: an empty role list is
   *  otherwise indistinguishable from a list the user cleared, and every launch
   *  would put the four defaults back under them. A catalog written before
   *  roles existed reads as unseeded, so it gets them on its next launch and
   *  never again. */
  seedOnce(): void {
    if (seedDefaults(this.#state)) this.#persist()
  }

  modes(): ChatMode[] {
    return structuredClone(this.#state.modes)
  }

  /** The voice this thread writes in, from the thread's own choice and the
   *  reader's default. Undefined is "normal": nothing is appended. */
  modeFor(threadMode?: string): ChatMode | undefined {
    return modeFor(this.#state, threadMode)
  }

  saveMode(mode: ChatMode): { mode: ChatMode } {
    saveMode(this.#state, mode)
    this.#persist()
    return { mode }
  }

  deleteMode(modeId: string): void {
    deleteMode(this.#state, modeId)
    this.#persist()
  }

  setDefaultMode(modeId: string | undefined): void {
    setDefaultMode(this.#state, modeId)
    this.#persist()
  }

  roles(): AgentRole[] {
    return structuredClone(this.#state.roles)
  }

  /** The role a spawn named, matched by name rather than id: the model writes
   *  the name it was shown, and ids are ours. */
  role(name: string): AgentRole | undefined {
    const found = this.#state.roles.find((one) => one.name === name)
    return found ? { ...found, tools: [...found.tools] } : undefined
  }

  /** Adds a role, or replaces the one with the same id.
   *
   *  A name already taken by a *different* role is refused rather than written:
   *  `parseRoles` keeps the first of two roles sharing a name, so accepting the
   *  write would show the user a saved role that disappeared on the next
   *  launch. A spawn names a role by name, so two of them is not a state the
   *  store can hold. */
  saveRole(role: AgentRole): { ok: boolean; reason?: string } {
    const taken = this.#state.roles.some((one) => one.name === role.name && one.id !== role.id)
    if (taken) return { ok: false, reason: `a role called "${role.name}" already exists` }

    const index = this.#state.roles.findIndex((one) => one.id === role.id)
    const clean: AgentRole = { ...role, tools: [...new Set(role.tools)] }

    if (index === -1) this.#state.roles.push(clean)
    else this.#state.roles[index] = clean
    this.#persist()
    return { ok: true }
  }

  deleteRole(id: string): void {
    const index = this.#state.roles.findIndex((one) => one.id === id)
    if (index === -1) return

    this.#state.roles.splice(index, 1)
    this.#persist()
  }

  namePool(): string[] {
    return [...this.#state.namePool]
  }

  setNamePool(names: string[]): void {
    this.#state.namePool = [...new Set(names.filter((one) => one !== ''))]
    this.#persist()
  }

  /** A workspace's language-server settings, as stored. */
  lspFor(workspaceId: string): WorkspaceLsp | undefined {
    return this.#state.workspaces.find((entry) => entry.id === workspaceId)?.lsp
  }

  /** Switches LSP, or one server, for one workspace.
   *
   *  Written per workspace rather than globally because the answer genuinely
   *  differs per repository: a Rust service and a folder of shell scripts do
   *  not want the same thing, and a global switch would make one of them
   *  wrong. */
  setLsp(workspaceId: string, lsp: WorkspaceLsp): void {
    const entry = this.#state.workspaces.find((one) => one.id === workspaceId)
    if (!entry) return
    entry.lsp = { on: lsp.on, ...(lsp.servers ? { servers: { ...lsp.servers } } : {}) }
    this.#persist()
  }

  get warning(): string | undefined {
    return this.#warning
  }

  workspace(id: string): WorkspaceEntry | undefined {
    return this.#state.workspaces.find((entry) => entry.id === id)
  }

  /** Pins a folder, or returns the existing pin if it is already there. */
  pin(path: string): WorkspaceEntry {
    const existing = this.#state.workspaces.find((entry) => entry.path === path)
    if (existing) return existing

    const voice = voiceFor(path)
    const entry: WorkspaceEntry = {
      id: randomUUID(),
      path,
      name: nameFor(path),
      note: voice.note,
      hue: voice.hue,
    }

    this.#state.workspaces.push(entry)
    this.#persist()
    return entry
  }

  unpin(id: string): void {
    const index = this.#state.workspaces.findIndex((entry) => entry.id === id)
    if (index === -1) return

    const [removed] = this.#state.workspaces.splice(index, 1)
    this.#state.focus.splice(index, 1)
    // Unpinning revokes what was allowed there; re-pinning should ask again.
    delete this.#state.approvals[removed.id]
    // A folder that is no longer pinned has no strip to hide threads from.
    delete this.#state.archived[removed.id]
    delete this.#state.retired[removed.id]
    delete this.#state.order[removed.id]
    delete this.#state.panes?.[removed.id]
    this.#state.workspaceIndex = Math.min(
      this.#state.workspaceIndex,
      Math.max(0, this.#state.workspaces.length - 1),
    )
    this.#persist()
  }

  /** The renderer's remembered position. Deliberately the only thing it writes. */
  setPosition(
    workspaceIndex: number,
    focus: number[],
    preferences?: Preferences,
    order?: Record<string, string[]>,
    panes?: CatalogState['panes'],
  ): void {
    this.#state.workspaceIndex = workspaceIndex
    this.#state.focus = focus
    if (preferences) this.#state.preferences = parsePreferences(preferences)
    if (order) this.#state.order = order
    if (panes) this.#state.panes = structuredClone(panes)
    this.#persist()
  }

  orderOf(workspaceId: string): string[] {
    return [...(this.#state.order[workspaceId] ?? [])]
  }

  /** Writes are queued rather than raced, so the last call wins the file. */
  #persist(): void {
    const state = this.snapshot()
    this.#writing = this.#writing
      .then(() => writeCatalog(this.#file, state))
      .catch((error: unknown) => {
        // Losing layout is not worth interrupting a session over.
        console.warn('[catalog] save failed:', error)
      })
  }

  /** Lets shutdown wait for a write that is still in flight. */
  flush(): Promise<void> {
    return this.#writing
  }
}
