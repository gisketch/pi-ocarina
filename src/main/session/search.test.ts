import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { searchThreads, SEARCH_BUDGET_MS } from './search'
import type { WorkspaceService } from './workspaces'

/** A workspace service with files on disk behind it, so the transcript scan is
 *  exercised rather than mocked away. */
async function stub(
  threads: { id: string; title: string; body?: string; modified?: string }[],
): Promise<WorkspaceService> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-search-'))
  const paths = new Map<string, string>()

  for (const thread of threads) {
    const path = join(dir, `${thread.id}.jsonl`)
    await writeFile(path, thread.body ?? '', 'utf8')
    paths.set(thread.id, path)
  }

  return {
    list: () => [{ id: 'w1', path: dir, name: 'pi-core', note: 'D', hue: 152 }],
    listThreads: async () =>
      threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        modified: thread.modified ?? '2026-08-15T10:00:00.000Z',
        messageCount: 1,
      })),
    locate: async (threadId: string) => ({ path: paths.get(threadId) ?? '', cwd: dir }),
  } as unknown as WorkspaceService
}

describe('searchThreads', () => {
  it('finds nothing for an empty query', async () => {
    const workspaces = await stub([{ id: 't1', title: 'retry backoff' }])

    expect(await searchThreads(workspaces, '   ')).toEqual({ hits: [], complete: true })
  })

  it('matches a thread title', async () => {
    const workspaces = await stub([{ id: 't1', title: 'retry backoff' }])
    const { hits } = await searchThreads(workspaces, 'backoff')

    expect(hits.map((hit) => hit.threadId)).toEqual(['t1'])
    expect(hits[0].workspaceName).toBe('pi-core')
  })

  it('ignores case', async () => {
    const workspaces = await stub([{ id: 't1', title: 'Retry Backoff' }])

    expect((await searchThreads(workspaces, 'BACKOFF')).hits).toHaveLength(1)
  })

  it('matches inside a transcript when the title does not', async () => {
    const workspaces = await stub([
      { id: 't1', title: 'something else', body: '{"text":"the jittered backoff loop"}' },
    ])
    const { hits } = await searchThreads(workspaces, 'jittered')

    expect(hits).toHaveLength(1)
    expect(hits[0].snippet).toContain('jittered')
  })

  it('cleans the JSON out of a transcript snippet', async () => {
    const workspaces = await stub([
      { id: 't1', title: 'x', body: '{"role":"user","text":"hello there world"}' },
    ])
    const { hits } = await searchThreads(workspaces, 'there')

    expect(hits[0].snippet).not.toContain('"')
    expect(hits[0].snippet).toContain('there')
  })

  it('returns nothing when a query matches neither title nor body', async () => {
    const workspaces = await stub([{ id: 't1', title: 'a', body: 'b' }])

    expect((await searchThreads(workspaces, 'zzz')).hits).toEqual([])
  })

  it('puts the most recent thread first', async () => {
    const workspaces = await stub([
      { id: 'old', title: 'backoff old', modified: '2026-01-01T00:00:00.000Z' },
      { id: 'new', title: 'backoff new', modified: '2026-08-15T00:00:00.000Z' },
    ])

    expect((await searchThreads(workspaces, 'backoff')).hits.map((h) => h.threadId)).toEqual([
      'new',
      'old',
    ])
  })

  it('says so when the time budget stopped it early', async () => {
    // Title matches are free and always complete; only transcript reads are
    // capped, so a budget already spent leaves the body scan undone.
    const workspaces = await stub([{ id: 't1', title: 'x', body: 'needle' }])
    let clock = 0
    const { hits, complete } = await searchThreads(workspaces, 'needle', () => {
      clock += SEARCH_BUDGET_MS + 1
      return clock
    })

    expect(complete).toBe(false)
    expect(hits).toEqual([])
  })

  it('survives a thread whose file cannot be read', async () => {
    const workspaces = await stub([{ id: 't1', title: 'a' }])
    ;(workspaces as unknown as { locate: () => Promise<never> }).locate = () =>
      Promise.reject(new Error('gone'))

    expect((await searchThreads(workspaces, 'needle')).hits).toEqual([])
  })
})
