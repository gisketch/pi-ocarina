import type { MockThread } from './types'

/** The reference's ocarina-ui columns, recorded as events. */

export const PALETTE_FLICKER: MockThread = {
  events: [
    {
      kind: 'user-message',
      id: 'u3',
      text: 'The command palette flickers when it opens — find where that comes from.',
    },
    { kind: 'thread-state', state: 'running' },

    { kind: 'tool-start', id: 'r-grep-palette', tool: 'grep', target: '"palette" · src/**' },
    { kind: 'tool-progress', id: 'r-grep-palette', meta: '214 files…' },

    // The approve card ends the ledger group, exactly as the reference draws it.
    { kind: 'approve', id: 'perm1', command: 'npx playwright install', note: '(~120MB browsers)' },

    { kind: 'agent-message-start', id: 'a5' },
    {
      kind: 'agent-message-delta',
      id: 'a5',
      text: 'The panel mounts before its enter class applies — likely a missing `requestAnimationFrame` in',
    },
  ],
}

export const ICON_AUDIT: MockThread = {
  open: ['r-todo'],
  events: [
    { kind: 'user-message', id: 'u4', text: 'List every icon we import but never render.' },

    { kind: 'tool-start', id: 'r-fetch', tool: 'fetch', target: 'registry.npmjs.org/lucide-react' },
    { kind: 'tool-end', id: 'r-fetch', status: 'plain', meta: '200 · 12kb' },

    { kind: 'tool-start', id: 'r-todo', tool: 'todo', target: 'audit icon imports' },
    {
      kind: 'tool-body',
      id: 'r-todo',
      body: {
        type: 'todo',
        items: [
          { done: true, text: 'scan import statements' },
          { done: true, text: 'cross-check JSX usage' },
          { done: true, text: 'compile dead list' },
        ],
      },
    },
    { kind: 'tool-end', id: 'r-todo', status: 'ok', meta: '3/3 ✓' },

    { kind: 'agent-message-start', id: 'a6' },
    {
      kind: 'agent-message-delta',
      id: 'a6',
      text: 'Found 11 dead imports across 6 files. Want a cleanup diff?',
    },
    { kind: 'agent-message-end', id: 'a6' },
  ],
}
