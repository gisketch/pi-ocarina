import type { GitStatus } from '../../../../shared/protocol'
import type { Workspace } from '../types'

/** Demo repository state. The harness has no git behind it, so the reference's
 *  three summaries are spelled out as the counts that produce them. */
function repo(branch: string, counts: Partial<GitStatus> = {}): GitStatus {
  return {
    branch,
    detached: false,
    ahead: 0,
    behind: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    untracked: 0,
    conflicts: 0,
    ...counts,
  }
}

/** Mock catalog mirroring the design reference's demo state (milestone 1 only —
 *  replaced by the real catalog + pi sessions in the session-backend milestone). */
export const WORKSPACES: Workspace[] = [
  {
    id: 'pi-core',
    name: 'pi-core',
    note: 'D',
    hue: 152,
    git: repo('main', { ahead: 1, added: 1, modified: 1 }),
    snippet: 'retry logic in sync worker',
    threads: [
      // Statuses match what each recorded stream projects to; `retry-backoff`
      // ends on an open question, which outranks its finished turn.
      {
        id: 'retry-backoff',
        title: 'retry backoff',
        status: 'waiting-input',
        meta: '14:02 · done ✓',
      },
      { id: 'flaky-e2e', title: 'flaky e2e on main', status: 'running', meta: 'running…' },
      { id: 'queue-refactor', title: 'queue refactor', status: 'done', meta: 'yesterday · done ✓' },
    ],
  },
  {
    id: 'ocarina-ui',
    name: 'ocarina-ui',
    note: 'F♯',
    hue: 265,
    git: repo('feat/palette', { added: 4, modified: 2 }),
    snippet: 'palette flicker on open',
    threads: [
      { id: 'palette-flicker', title: 'palette flicker', status: 'waiting-input', meta: 'running…' },
      { id: 'icon-audit', title: 'icon set audit', status: 'idle', meta: 'idle' },
      { id: 'fan-out', title: 'fan out', status: 'running', meta: 'running…' },
      { id: 'grouped-sweep', title: 'grouped sweep', status: 'running', meta: 'running…' },
      // Not from the reference mockups: prose is the one thing they never
      // covered, and a heading, a table, a quote and a fence had no way to be
      // looked at. docs-site cannot hold it — its single thread is what the
      // thread-clamp test switches into.
      { id: 'markdown-showcase', title: 'markdown shapes', status: 'idle', meta: 'idle' },
    ],
  },
  {
    id: 'docs-site',
    name: 'docs-site',
    note: 'A',
    hue: 45,
    git: repo('main'),
    snippet: 'fresh thread',
    threads: [
      { id: 'fresh', title: 'docs-site', status: 'idle', meta: 'fresh thread', fresh: true },
    ],
  },
]
