import type { MockThread } from './types'

/** The Polish mockup's §01, recorded as events.
 *
 *  Every grouping rule in one ledger: a run of reads that collapses, a run of
 *  edits whose diffs stay one expand away, a single bash call that never
 *  groups, and a live call at the end. This is the fixture the design is
 *  checked against in the browser. */
export const GROUPED_SWEEP: MockThread = {
  events: [
    {
      kind: 'user-message',
      id: 'u9',
      text: 'The sync queue drains slowly under load — find it and fix it.',
    },
    { kind: 'thread-state', state: 'running' },

    { kind: 'tool-start', id: 'g-read-1', tool: 'read', target: 'src/sync/worker.ts' },
    { kind: 'tool-end', id: 'g-read-1', status: 'ok', meta: '142L' },
    { kind: 'tool-start', id: 'g-read-2', tool: 'read', target: 'src/sync/retry.ts' },
    { kind: 'tool-end', id: 'g-read-2', status: 'ok', meta: '38L' },
    { kind: 'tool-start', id: 'g-read-3', tool: 'read', target: 'src/queue/heap.ts' },
    { kind: 'tool-end', id: 'g-read-3', status: 'ok', meta: '201L' },
    { kind: 'tool-start', id: 'g-read-4', tool: 'read', target: 'src/sync/types.ts' },
    { kind: 'tool-end', id: 'g-read-4', status: 'ok', meta: '31L' },

    // Asking the compiler, three ways: one group, three operations.
    { kind: 'tool-start', id: 'g-lsp-1', tool: 'lsp', target: 'worker.ts', detail: 'outline' },
    { kind: 'tool-end', id: 'g-lsp-1', status: 'ok', meta: '14 symbols' },
    { kind: 'tool-start', id: 'g-lsp-2', tool: 'lsp', target: 'withRetry', detail: 'references' },
    { kind: 'tool-end', id: 'g-lsp-2', status: 'ok', meta: '6 refs · 3 files' },
    { kind: 'tool-start', id: 'g-lsp-3', tool: 'lsp', target: 'heap.ts', detail: 'diagnostics' },
    { kind: 'tool-end', id: 'g-lsp-3', status: 'ok', meta: '2 errors 5 warns' },

    { kind: 'tool-start', id: 'g-edit-1', tool: 'edit', target: 'src/sync/worker.ts' },
    {
      kind: 'tool-body',
      id: 'g-edit-1',
      body: {
        type: 'diff',
        lines: [
          { sign: '-', text: 'const res = await push(job.changes)' },
          { sign: '+', text: 'const res = await withRetry(() => push(job.changes))' },
        ],
      },
    },
    { kind: 'tool-end', id: 'g-edit-1', status: 'ok', meta: '+14 −3' },
    { kind: 'tool-start', id: 'g-edit-2', tool: 'edit', target: 'src/sync/retry.ts' },
    { kind: 'tool-end', id: 'g-edit-2', status: 'ok', meta: '+22' },

    // A single call never groups: two commands in a row are two things that
    // happened, and this one is only one.
    { kind: 'tool-start', id: 'g-bash', tool: 'bash', target: 'pnpm test sync' },
    { kind: 'tool-end', id: 'g-bash', status: 'ok', meta: 'exit 0 · 3.2s' },

    // Still running: the group it belongs to draws open around it.
    { kind: 'tool-start', id: 'g-grep-1', tool: 'grep', target: '"backoff" · src/**' },
    { kind: 'tool-end', id: 'g-grep-1', status: 'ok', meta: '11 matches' },
    { kind: 'tool-start', id: 'g-grep-2', tool: 'grep', target: '"drain" · src/**' },
    { kind: 'tool-progress', id: 'g-grep-2', meta: '214 files…' },
  ],
}
