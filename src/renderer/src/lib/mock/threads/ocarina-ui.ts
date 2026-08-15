import type { Block } from '../../thread'

/** Transcribed from the reference's ocarina-ui columns. */

export const PALETTE_FLICKER: Block[] = [
  {
    kind: 'user',
    id: 'u3',
    text: 'The command palette flickers when it opens — find where that comes from.',
  },
  {
    kind: 'ledger',
    id: 'led4',
    rows: [
      {
        id: 'r-grep-palette',
        kind: 'grep',
        target: '"palette" · src/**',
        status: 'running',
        meta: '214 files…',
      },
    ],
  },
  {
    kind: 'approve',
    id: 'perm1',
    command: 'npx playwright install',
    note: '(~120MB browsers)',
  },
  {
    kind: 'agent',
    id: 'a5',
    text: 'The panel mounts before its enter class applies — likely a missing `requestAnimationFrame` in',
    streaming: true,
  },
]

export const ICON_AUDIT: Block[] = [
  { kind: 'user', id: 'u4', text: 'List every icon we import but never render.' },
  {
    kind: 'ledger',
    id: 'led5',
    rows: [
      {
        id: 'r-fetch',
        kind: 'fetch',
        target: 'registry.npmjs.org/lucide-react',
        status: 'plain',
        meta: '200 · 12kb',
      },
      {
        id: 'r-todo',
        kind: 'todo',
        target: 'audit icon imports',
        status: 'ok',
        meta: '3/3 ✓',
        open: true,
        body: {
          type: 'todo',
          items: [
            { done: true, text: 'scan import statements' },
            { done: true, text: 'cross-check JSX usage' },
            { done: true, text: 'compile dead list' },
          ],
        },
      },
    ],
  },
  {
    kind: 'agent',
    id: 'a6',
    text: 'Found 11 dead imports across 6 files. Want a cleanup diff?',
  },
]
