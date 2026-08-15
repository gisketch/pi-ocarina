import type { Block } from '../../thread'

/** Transcribed from the reference's pi-core columns. */

export const RETRY_BACKOFF: Block[] = [
  {
    kind: 'user',
    id: 'u1',
    text: 'Add retry with exponential backoff to the sync worker, then run the sync tests.',
  },
  {
    kind: 'agent',
    id: 'a1',
    text: 'Wrapping `runSync()` in a bounded retry loop — 5 attempts, jittered backoff from 250ms.',
  },
  {
    kind: 'ledger',
    id: 'led1',
    rows: [
      {
        id: 'r-read',
        kind: 'read',
        target: 'src/sync/worker.ts',
        status: 'plain',
        meta: '142L',
        open: false,
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
      {
        id: 'r-grep',
        kind: 'grep',
        target: '"backoff" · src/**',
        status: 'plain',
        meta: '3 matches',
        open: true,
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
      {
        id: 'r-write',
        kind: 'write',
        target: 'src/sync/retry.ts',
        status: 'ok',
        meta: '+38L new file',
      },
      {
        id: 'r-edit',
        kind: 'edit',
        target: 'src/sync/worker.ts',
        status: 'ok',
        meta: '+14 −3',
        open: true,
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
      {
        id: 'r-bash',
        kind: 'bash',
        target: 'pnpm test sync',
        status: 'ok',
        meta: 'exit 0 · 3.2s',
        open: false,
        body: {
          type: 'terminal',
          lines: [
            { text: '$ pnpm test sync', tone: 'prompt' },
            { text: 'sync/worker.spec.ts  ✓ 12 passed', tone: 'ok' },
            { text: 'sync/retry.spec.ts   ✓ 6 passed', tone: 'ok' },
          ],
        },
      },
    ],
  },
  {
    kind: 'agent',
    id: 'a2',
    text: 'Done. Retries only on 5xx, capped at 5 attempts (~4s worst case). All 18 sync tests pass.',
  },
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
]

export const FLAKY_E2E: Block[] = [
  { kind: 'user', id: 'u2', text: 'Why does checkout.e2e fail 1 in 5 runs on main?' },
  {
    kind: 'ledger',
    id: 'led2',
    rows: [
      {
        id: 'r-e2e-fail',
        kind: 'bash',
        target: 'pnpm e2e checkout',
        status: 'fail',
        meta: 'exit 1 · 41s',
        open: true,
        body: {
          type: 'terminal',
          tone: 'error',
          lines: [
            { text: '✗ expect(cart.items).toHaveLength(2)', tone: 'err' },
            { text: '  received: 1 — checkout.e2e.ts:88', tone: 'dim' },
          ],
        },
      },
      {
        id: 'r-e2e-repeat',
        kind: 'bash',
        target: 'pnpm e2e checkout --repeat 10',
        status: 'running',
        meta: 'run 4/10…',
      },
    ],
  },
  {
    kind: 'agent',
    id: 'a3',
    text: 'Reproducing first — early signal points at a race in the cart fixture',
    streaming: true,
  },
]

export const QUEUE_REFACTOR: Block[] = [
  {
    kind: 'agent',
    id: 'a4',
    text: 'Moved job scheduling to a priority heap; dropped p95 dequeue latency from 40ms → 6ms. 9 files touched, all tests green.',
  },
  {
    kind: 'ledger',
    id: 'led3',
    rows: [
      { id: 'r-heap', kind: 'edit', target: 'src/queue/heap.ts', status: 'plain', meta: '+88 −41' },
      { id: 'r-qtest', kind: 'bash', target: 'pnpm test queue', status: 'ok', meta: 'exit 0' },
    ],
  },
]
