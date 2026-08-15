import { readFile } from 'node:fs/promises'
import type { SearchHit, ThreadSummary } from '../../shared/protocol'
import type { WorkspaceService } from './workspaces'

/** How long a search may spend reading transcripts before it answers with what
 *  it has. A search that takes longer than the user's patience is a search they
 *  have already stopped waiting for. */
export const SEARCH_BUDGET_MS = 400

/** Most hits worth showing. Beyond this the list is a wall, not an answer. */
export const SEARCH_LIMIT = 40

const SNIPPET = 90

/** Searches thread titles first, then their transcripts.
 *
 *  Titles are already in memory, so they are free and always complete. Reading
 *  transcripts is not, so it runs under a time budget and stops when the budget
 *  is gone — the result says so rather than pretending it saw everything. */
export async function searchThreads(
  workspaces: WorkspaceService,
  query: string,
  now: () => number = Date.now,
): Promise<{ hits: SearchHit[]; complete: boolean }> {
  const needle = query.trim().toLowerCase()
  if (needle === '') return { hits: [], complete: true }

  const deadline = now() + SEARCH_BUDGET_MS
  const hits: SearchHit[] = []
  const unread: { workspaceId: string; thread: ThreadSummary }[] = []

  for (const workspace of workspaces.list()) {
    // Closed threads are searched too. Closing hides a column; the history is
    // still the user's, and search is how they get back to it.
    const threads = await workspaces
      .listThreads(workspace.id, { includeArchived: true })
      .catch(() => [])

    for (const thread of threads) {
      if (thread.title.toLowerCase().includes(needle)) {
        hits.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          threadId: thread.id,
          title: thread.title,
          snippet: thread.title,
          modified: thread.modified,
        })
      } else {
        unread.push({ workspaceId: workspace.id, thread })
      }
    }
  }

  let complete = true
  for (const { workspaceId, thread } of unread) {
    if (hits.length >= SEARCH_LIMIT) break
    if (now() > deadline) {
      complete = false
      break
    }

    const snippet = await matchInTranscript(workspaces, thread.id, needle)
    if (!snippet) continue

    hits.push({
      workspaceId,
      workspaceName: workspaces.list().find((w) => w.id === workspaceId)?.name ?? '',
      threadId: thread.id,
      title: thread.title,
      snippet,
      modified: thread.modified,
    })
  }

  hits.sort((a, b) => b.modified.localeCompare(a.modified))
  return { hits: hits.slice(0, SEARCH_LIMIT), complete }
}

/** The line around the first match in a thread's transcript, or null.
 *
 *  Read as raw text rather than parsed: this is deciding what to show in a
 *  search list, and parsing every session file to answer a keystroke would cost
 *  far more than it is worth. */
async function matchInTranscript(
  workspaces: WorkspaceService,
  threadId: string,
  needle: string,
): Promise<string | null> {
  const location = await workspaces.locate(threadId).catch(() => null)
  if (!location) return null

  let raw: string
  try {
    raw = await readFile(location.path, 'utf8')
  } catch {
    return null
  }

  const at = raw.toLowerCase().indexOf(needle)
  if (at === -1) return null

  return clean(raw.slice(Math.max(0, at - SNIPPET / 2), at + SNIPPET))
}

/** Session files are JSON lines, so a raw slice is full of escapes and keys.
 *  This makes the fragment readable without pretending it is prose. */
function clean(fragment: string): string {
  return fragment
    .replace(/\\[nrt]/g, ' ')
    .replace(/["{}[\],]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
