import type { Workspace } from '../types'

/** Mock catalog mirroring the design reference's demo state (milestone 1 only —
 *  replaced by the real catalog + pi sessions in the session-backend milestone). */
export const WORKSPACES: Workspace[] = [
  {
    id: 'pi-core',
    name: 'pi-core',
    note: 'D',
    hue: 152,
    branch: 'main',
    git: '↑1 +1~1',
    snippet: 'retry logic in sync worker',
    threads: [
      { id: 'retry-backoff', title: 'retry backoff', status: 'done', meta: '14:02 · done ✓' },
      { id: 'flaky-e2e', title: 'flaky e2e on main', status: 'running', meta: 'running…' },
      { id: 'queue-refactor', title: 'queue refactor', status: 'done', meta: 'yesterday · done ✓' },
    ],
  },
  {
    id: 'ocarina-ui',
    name: 'ocarina-ui',
    note: 'F♯',
    hue: 265,
    branch: 'feat/palette',
    git: '+4~2',
    snippet: 'palette flicker on open',
    threads: [
      { id: 'palette-flicker', title: 'palette flicker', status: 'running', meta: 'running…' },
      { id: 'icon-audit', title: 'icon set audit', status: 'idle', meta: 'idle' },
    ],
  },
  {
    id: 'docs-site',
    name: 'docs-site',
    note: 'A',
    hue: 45,
    branch: 'main',
    git: '',
    snippet: 'fresh thread',
    threads: [{ id: 'fresh', title: 'docs-site', status: 'idle', meta: 'fresh thread' }],
  },
]
