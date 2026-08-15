import { readFile, rename, writeFile } from 'node:fs/promises'
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from '../shared/preferences'

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
}

/** What the shell restores on launch: which folders are pinned, where the user
 *  was standing, and what they set. Thread identity is not stored — pi's own
 *  session store is the truth about what threads exist, so it cannot drift out
 *  of sync here. */
export interface CatalogState {
  version: 3
  workspaces: WorkspaceEntry[]
  workspaceIndex: number
  focus: number[]
  /** Workspace id → "always allow" rule keys. Policy lives in main only. */
  approvals: Record<string, string[]>
  preferences: Preferences
}

/** A fresh empty catalog.
 *
 *  A function, not a shared constant: spreading a constant copies the object but
 *  not its arrays, so every caller would end up pushing workspaces into the same
 *  `workspaces` array. */
export function defaultCatalog(): CatalogState {
  return {
    version: 3,
    workspaces: [],
    workspaceIndex: 0,
    focus: [],
    approvals: {},
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
    })
  }
  return entries
}

/** Approval rules are security-relevant, so anything malformed is dropped
 *  rather than coerced: a rule we cannot read must never become a rule that
 *  silently allows something. */
function parseApprovals(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const rules: Record<string, string[]> = {}
  for (const [workspaceId, keys] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(keys)) continue
    const clean = keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    if (clean.length > 0) rules[workspaceId] = [...new Set(clean)]
  }
  return rules
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

  // Version 2 is version 3 without preferences, so it upgrades by taking the
  // defaults. Nothing the user pinned or approved is lost.
  if (record.version !== 2 && record.version !== 3) {
    return {
      state: defaultCatalog(),
      warning: `unsupported catalog version: ${String(record.version)}`,
    }
  }

  return {
    state: {
      version: 3,
      workspaces: parseWorkspaces(record.workspaces),
      workspaceIndex,
      focus,
      approvals: parseApprovals(record.approvals),
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
