import type { UiEvent } from '../../../../../shared/protocol'
import type { MockThread } from './types'

/** The reference's pi-core columns, recorded as the events that would have
 *  produced them. The shell renders them through the same reducer a live turn
 *  uses, so the mock catalog cannot drift from the real projection. */

export const RETRY_BACKOFF: MockThread = {
  open: ['r-grep', 'r-edit'],
  events: [
    {
      kind: 'user-message',
      id: 'u1',
      text: 'Add retry with exponential backoff to the sync worker, then run the sync tests.',
    },
    ...says(
      'a1',
      'Wrapping `runSync()` in a bounded retry loop — 5 attempts, jittered backoff from 250ms.',
    ),

    { kind: 'tool-start', id: 'r-read', tool: 'read', target: 'src/sync/worker.ts' },
    {
      kind: 'tool-body',
      id: 'r-read',
      body: {
        type: 'code',
        lines: [
          { text: 'export async function runSync(job: SyncJob) {' },
          { text: '  const res = await push(job.changes)   ', comment: '// throws on 5xx' },
          { text: '  await ack(job.id, res.cursor)' },
          { text: '}' },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-read', status: 'plain', meta: '142L' },

    { kind: 'tool-start', id: 'r-grep', tool: 'grep', target: '"backoff" · src/**' },
    {
      kind: 'tool-body',
      id: 'r-grep',
      body: {
        type: 'matches',
        lines: [
          {
            location: 'src/lib/net.ts:41',
            before: 'const ',
            match: 'backoff',
            after: 'Ms = base * 2 ** attempt',
          },
          { location: 'src/lib/net.ts:58', before: 'jitter(', match: 'backoff', after: 'Ms)' },
          {
            location: 'docs/adr/007.md:12',
            before: 'exponential ',
            match: 'backoff',
            after: ' policy',
          },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-grep', status: 'plain', meta: '3 matches' },

    { kind: 'tool-start', id: 'r-write', tool: 'write', target: 'src/sync/retry.ts' },
    { kind: 'tool-end', id: 'r-write', status: 'ok', meta: '+38L new file' },

    { kind: 'tool-start', id: 'r-edit', tool: 'edit', target: 'src/sync/worker.ts' },
    {
      kind: 'tool-body',
      id: 'r-edit',
      body: {
        type: 'diff',
        lines: [
          { sign: '-', text: 'const res = await push(job.changes)' },
          { sign: '+', text: 'const res = await withRetry(() => push(job.changes), {' },
          { sign: '+', text: '  attempts: 5, baseMs: 250, jitter: true,' },
          { sign: '+', text: '  retryOn: (e) => e.status >= 500,' },
          { sign: '+', text: '})' },
          { sign: ' ', text: 'await ack(job.id, res.cursor)' },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-edit', status: 'ok', meta: '+14 −3' },

    { kind: 'tool-start', id: 'r-bash', tool: 'bash', target: 'pnpm test sync' },
    {
      kind: 'tool-body',
      id: 'r-bash',
      body: {
        type: 'terminal',
        lines: [
          { text: '$ pnpm test sync', tone: 'prompt' },
          { text: 'sync/worker.spec.ts  ✓ 12 passed', tone: 'ok' },
          { text: 'sync/retry.spec.ts   ✓ 6 passed', tone: 'ok' },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-bash', status: 'ok', meta: 'exit 0 · 3.2s' },

    ...says(
      'a2',
      'Done. Retries only on 5xx, capped at 5 attempts (~4s worst case). All 18 sync tests pass.',
    ),
    {
      kind: 'ask',
      id: 'ask1',
      question: 'Add a metrics counter for retry exhaustion?',
      options: [
        { label: 'Yes — counter + alert' },
        { label: 'Just the counter' },
        { label: 'No, ship as is' },
      ],
    },
  ],
}

export const FLAKY_E2E: MockThread = {
  open: ['r-e2e-fail'],
  events: [
    { kind: 'user-message', id: 'u2', text: 'Why does checkout.e2e fail 1 in 5 runs on main?' },
    { kind: 'thread-state', state: 'running' },

    { kind: 'tool-start', id: 'r-e2e-fail', tool: 'bash', target: 'pnpm e2e checkout' },
    {
      kind: 'tool-body',
      id: 'r-e2e-fail',
      body: {
        type: 'terminal',
        tone: 'error',
        lines: [
          { text: '✗ expect(cart.items).toHaveLength(2)', tone: 'err' },
          { text: '  received: 1 — checkout.e2e.ts:88', tone: 'dim' },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-e2e-fail', status: 'fail', meta: 'exit 1 · 41s' },

    { kind: 'tool-start', id: 'r-e2e-repeat', tool: 'bash', target: 'pnpm e2e checkout --repeat 10' },
    { kind: 'tool-progress', id: 'r-e2e-repeat', meta: 'run 4/10…' },

    // Still mid-sentence: no `agent-message-end`, so the caret keeps blinking.
    { kind: 'agent-message-start', id: 'a3' },
    {
      kind: 'agent-message-delta',
      id: 'a3',
      text: 'Reproducing first — early signal points at a race in the cart fixture',
    },
  ],
}

export const QUEUE_REFACTOR: MockThread = {
  events: [
    ...says(
      'a4',
      'Moved job scheduling to a priority heap; dropped p95 dequeue latency from 40ms → 6ms. 9 files touched, all tests green.',
    ),
    { kind: 'tool-start', id: 'r-heap', tool: 'edit', target: 'src/queue/heap.ts' },
    { kind: 'tool-end', id: 'r-heap', status: 'plain', meta: '+88 −41' },
    { kind: 'tool-start', id: 'r-qtest', tool: 'bash', target: 'pnpm test queue' },
    { kind: 'tool-end', id: 'r-qtest', status: 'ok', meta: 'exit 0' },
  ],
}

/** A finished agent message: the reference's static text, said in one piece. */
function says(id: string, text: string): UiEvent[] {
  return [
    { kind: 'agent-message-start', id },
    { kind: 'agent-message-delta', id, text },
    { kind: 'agent-message-end', id },
  ]
}
