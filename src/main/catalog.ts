import { readFile, rename, writeFile } from 'node:fs/promises'
import { parseNamePool, parseRoles } from '../shared/agent-roles'
import { parseModes, type ChatMode } from '../shared/chat-modes'
import type { WorkspaceLsp } from '../shared/lsp'
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from '../shared/preferences'
import { isPermissionLevel, type PermissionLevel } from '../shared/permissions'
import type { AgentRole } from '../shared/vocabulary'

export { DEFAULT_PREFERENCES, LEADER_TIMEOUT_RANGE, parsePreferences } from '../shared/preferences'
export type { Preferences } from '../shared/preferences'

/** A folder the user pinned. Identity (note, hue) is derived from the path, but
 *  stored so a future palette change cannot repaint everyone's workspaces. */
export interface WorkspaceEntry {
  id: string
  path: string
  name: string
  note: string
  hue: number
  /** Language servers, per workspace. Absent means off, which is the default:
   *  a repository with no typed code gains nothing from a background daemon. */
  lsp?: WorkspaceLsp
  /** How much this workspace asks before a tool runs. Absent means it follows
   *  the global default, which is what most workspaces should do. */
  permission?: PermissionLevel
}

/** What the shell restores on launch: which folders are pinned, where the user
 *  was standing, and what they set. Thread identity is not stored — pi's own
 *  session store is the truth about what threads exist, so it cannot drift out
 *  of sync here. */
export interface CatalogState {
  version: 9
  workspaces: WorkspaceEntry[]
  workspaceIndex: number
  focus: number[]
  /** Workspace id → "always allow" rule keys. Policy lives in main only. */
  approvals: Record<string, string[]>
  /** Workspace id → thread ids the user closed. Closing hides a thread from the
   *  strip; the session file stays on disk, so history search still finds it
   *  and opening it from there brings the column back. */
  archived: Record<string, string[]>
  /** Workspace id → branches whose worktree this app has removed.
   *
   *  pi lists sessions by working directory, and the app finds those
   *  directories with `git worktree list` — so a checkout that is gone takes
   *  its thread out of every listing with it, and history search stops finding
   *  a conversation whose transcript is still on disk. Remembering the branch
   *  is enough: the directory it stood in is derived from it. */
  retired: Record<string, string[]>
  /** Workspace id → column ids in the order the user arranged them with
   *  ⇧H/⇧L. Ids not listed sort after, so a thread created since the last
   *  save still appears rather than being dropped by an older order. */
  order: Record<string, string[]>
  /** Workspace id → attached panes restored as fresh processes on launch. */
  panes?: Record<string, PersistedPane[]>
  /** The roles a child agent can be spawned as. */
  roles: AgentRole[]
  /** The voices the agent can be asked to write in. Not roles: a role says what
   *  a child agent is and which tools it may touch, and a mode says how the
   *  thread the reader is reading writes back to them. */
  modes: ChatMode[]
  /** The names children are drawn from, one spawn at a time. */
  namePool: string[]
  /** Whether the shipped roles and names have ever been written.
   *
   *  Seeding happens once and never again, so a user who edited a default keeps
   *  the edit and a user who deleted all four keeps them deleted. Without this
   *  marker an empty list is indistinguishable from a cleared one, and every
   *  launch would put the defaults back. */
  seeded: boolean
  /** Whether the shipped modes have ever been written.
   *
   *  A marker of its own rather than reusing `seeded`. Every catalog that
   *  predates modes is already seeded for roles, so a shared flag would mean
   *  no existing install ever saw the shipped voice — the one case seeding
   *  exists for. */
  seededModes: boolean
  preferences: Preferences
}

export interface PersistedPane {
  id: string
  kind: 'terminal'
  hostId: string
  side: 'left' | 'right'
}

/** A fresh empty catalog.
 *
 *  A function, not a shared constant: spreading a constant copies the object but
 *  not its arrays, so every caller would end up pushing workspaces into the same
 *  `workspaces` array. */
export function defaultCatalog(): CatalogState {
  return {
    version: 9,
    workspaces: [],
    workspaceIndex: 0,
    focus: [],
    approvals: {},
    archived: {},
    retired: {},
    order: {},
    panes: {},
    roles: [],
    modes: [],
    namePool: [],
    seeded: false,
    seededModes: false,
    preferences: { ...DEFAULT_PREFERENCES },
  }
}

/** For comparison and display only — never spread this to make a new catalog. */
export const DEFAULT_CATALOG: Readonly<CatalogState> = defaultCatalog()

/** All the renderer is allowed to write: where the user was standing, and what
 *  they set. Workspaces and approval rules stay in main. */
export interface CatalogPosition {
  workspaceIndex: number
  focus: number[]
  preferences?: Preferences
  /** Column order per workspace, as arranged with ⇧H/⇧L. */
  order?: Record<string, string[]>
  panes?: Record<string, PersistedPane[]>
}

export interface CatalogLoad {
  state: CatalogState
  /** Present when the stored catalog was unusable and defaults were substituted. */
  warning?: string
}

function isFiniteIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Drops any workspace missing the two fields that cannot be reconstructed. */
function parseWorkspaces(value: unknown): WorkspaceEntry[] {
  if (!Array.isArray(value)) return []

  const entries: WorkspaceEntry[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>

    const id = text(record.id)
    const path = text(record.path)
    if (!id || !path) continue

    entries.push({
      id,
      path,
      name: text(record.name) ?? path,
      note: text(record.note) ?? '',
      hue: typeof record.hue === 'number' ? record.hue : 0,
      ...(parseLsp(record.lsp) ? { lsp: parseLsp(record.lsp)! } : {}),
      ...(isPermissionLevel(record.permission) ? { permission: record.permission } : {}),
    })
  }
  return entries
}

/** A workspace's LSP settings, or nothing.
 *
 *  Anything unreadable becomes nothing rather than a default: a record written
 *  before this field existed has no opinion about language servers, and
 *  inventing one for it would start processes the reader never asked for. */
function parseLsp(value: unknown): WorkspaceLsp | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.on !== 'boolean') return null

  const servers: Record<string, boolean> = {}
  if (typeof record.servers === 'object' && record.servers !== null) {
    for (const [id, on] of Object.entries(record.servers as Record<string, unknown>)) {
      if (typeof on === 'boolean') servers[id] = on
    }
  }

  return { on: record.on, ...(Object.keys(servers).length > 0 ? { servers } : {}) }
}

/** A map of id → list of ids, with anything unreadable dropped. Used for both
 *  approval rules and the archived-thread list.
 *
 *  Approval rules are security-relevant, so anything malformed is dropped
 *  rather than coerced: a rule we cannot read must never become a rule that
 *  silently allows something. */
function parseIdLists(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const rules: Record<string, string[]> = {}
  for (const [workspaceId, keys] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(keys)) continue
    const clean = keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    if (clean.length > 0) rules[workspaceId] = [...new Set(clean)]
  }
  return rules
}

function parsePanes(value: unknown): Record<string, PersistedPane[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: Record<string, PersistedPane[]> = {}
  for (const [workspaceId, rawPanes] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawPanes)) continue
    const panes: PersistedPane[] = []
    for (const raw of rawPanes) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
      const pane = raw as Record<string, unknown>
      const id = text(pane.id)
      const hostId = text(pane.hostId)
      if (!id || !hostId || pane.kind !== 'terminal') continue
      if (pane.side !== 'left' && pane.side !== 'right') continue
      panes.push({ id, hostId, kind: 'terminal', side: pane.side })
    }
    if (panes.length > 0) result[workspaceId] = panes
  }
  return result
}

/** Validates untrusted JSON. Never throws: a broken catalog must not stop the app. */
export function parseCatalog(raw: string): CatalogLoad {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { state: defaultCatalog(), warning: 'catalog is not valid JSON' }
  }

  if (typeof data !== 'object' || data === null) {
    return { state: defaultCatalog(), warning: 'catalog is not an object' }
  }

  const record = data as Record<string, unknown>
  const workspaceIndex = isFiniteIndex(record.workspaceIndex) ? record.workspaceIndex : 0
  const focus = Array.isArray(record.focus) ? record.focus.filter(isFiniteIndex) : []

  // Version 1 had no workspaces, only a remembered position. Upgrading it is
  // not an error — the user simply had nothing pinned yet.
  if (record.version === 1) {
    return { state: { ...defaultCatalog(), workspaceIndex, focus } }
  }

  // Each older version simply lacked a field: 2 had no preferences, 3 no
  // archived list, 4 no column order, 5 no retired worktrees, 6 no roles, 7 no
  // permission levels — a catalog from before them reads as `auto`, the new
  // default, rather than keeping the old ask-about-everything behaviour it
  // never chose. 8 had no chat modes, and a catalog from before them opens with
  // no voice set, which is what "normal" is. They
  // upgrade by taking the defaults for what they never stored; nothing the user
  // pinned or approved is lost. A catalog that predates roles reads as unseeded,
  // so the shipped roles arrive on its next launch.
  if (![2, 3, 4, 5, 6, 7, 8, 9].includes(record.version as number)) {
    return {
      state: defaultCatalog(),
      warning: `unsupported catalog version: ${String(record.version)}`,
    }
  }

  return {
    state: {
      version: 9,
      workspaces: parseWorkspaces(record.workspaces),
      workspaceIndex,
      focus,
      approvals: parseIdLists(record.approvals),
      archived: parseIdLists(record.archived),
      retired: parseIdLists(record.retired),
      order: parseIdLists(record.order),
      panes: parsePanes(record.panes),
      roles: parseRoles(record.roles),
      modes: parseModes(record.modes),
      namePool: parseNamePool(record.namePool),
      seeded: record.seeded === true,
      seededModes: record.seededModes === true,
      preferences: parsePreferences(record.preferences),
    },
  }
}

export async function readCatalog(file: string): Promise<CatalogLoad> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // A missing catalog is the normal first-run case, not a problem to report.
    if (code === 'ENOENT') return { state: defaultCatalog() }
    return { state: defaultCatalog(), warning: `catalog unreadable: ${code ?? 'unknown error'}` }
  }
  return parseCatalog(raw)
}

/** Writes atomically so a crash mid-write cannot leave a truncated catalog. */
export async function writeCatalog(file: string, state: CatalogState): Promise<void> {
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8')
  await rename(temp, file)
}
