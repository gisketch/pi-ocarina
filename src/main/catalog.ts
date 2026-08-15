import { readFile, rename, writeFile } from 'node:fs/promises'

/** Layout the shell restores on launch. The real catalog (pinned folders, hues,
 *  thread↔session mapping) grows from this in the session-backend milestone. */
export interface CatalogState {
  version: 1
  workspaceIndex: number
  focus: number[]
}

export const DEFAULT_CATALOG: CatalogState = { version: 1, workspaceIndex: 0, focus: [] }

export interface CatalogLoad {
  state: CatalogState
  /** Present when the stored catalog was unusable and defaults were substituted. */
  warning?: string
}

function isFiniteIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Validates untrusted JSON. Never throws: a broken catalog must not stop the app. */
export function parseCatalog(raw: string): CatalogLoad {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { state: { ...DEFAULT_CATALOG }, warning: 'catalog is not valid JSON' }
  }

  if (typeof data !== 'object' || data === null) {
    return { state: { ...DEFAULT_CATALOG }, warning: 'catalog is not an object' }
  }

  const record = data as Record<string, unknown>
  if (record.version !== 1) {
    return { state: { ...DEFAULT_CATALOG }, warning: `unsupported catalog version: ${String(record.version)}` }
  }

  const workspaceIndex = isFiniteIndex(record.workspaceIndex) ? record.workspaceIndex : 0
  const focus = Array.isArray(record.focus) ? record.focus.filter(isFiniteIndex) : []

  return { state: { version: 1, workspaceIndex, focus } }
}

export async function readCatalog(file: string): Promise<CatalogLoad> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // A missing catalog is the normal first-run case, not a problem to report.
    if (code === 'ENOENT') return { state: { ...DEFAULT_CATALOG } }
    return { state: { ...DEFAULT_CATALOG }, warning: `catalog unreadable: ${code ?? 'unknown error'}` }
  }
  return parseCatalog(raw)
}

/** Writes atomically so a crash mid-write cannot leave a truncated catalog. */
export async function writeCatalog(file: string, state: CatalogState): Promise<void> {
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8')
  await rename(temp, file)
}
