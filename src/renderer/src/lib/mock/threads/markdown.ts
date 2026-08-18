import type { UiEvent } from '../../../../../shared/protocol'
import type { MockThread } from './types'

/** Every markdown shape the renderer draws, in one column.
 *
 *  Prose is the one thing the reference mockups never covered, so a heading, a
 *  table, a quote and a fence had no way to be looked at in `pnpm dev:web` —
 *  each was checked by reading its CSS and hoping. This column exists to be
 *  looked at. */
export const MARKDOWN_SHOWCASE: MockThread = {
  events: [
    { kind: 'user-message', id: 'u1', text: 'Show me every markdown shape you can draw.' },
    { kind: 'agent-message-start', id: 'a1' },
    {
      kind: 'agent-message-delta',
      id: 'a1',
      text: [
        '## Heading two',
        '',
        'A paragraph with `inline code`, **bold**, *italic* and a [link](https://example.com).',
        '',
        '### Heading three',
        '',
        '1. First',
        '2. Second',
        '',
        '- A bullet',
        '- Another bullet',
        '',
        '| Name | Status | Owner |',
        '| --- | --- | --- |',
        '| Alpha | Active | ghegi |',
        '| Beta | Pending | pi |',
        '| Gamma | Blocked | nobody |',
        '',
        '> This is a blockquote.',
        '',
        '```ts',
        'export function sync(job: Job): Promise<void> {',
        '  return push(job.changes)',
        '}',
        '```',
        '',
        '---',
        '',
        'A closing line.',
      ].join('\n'),
    },
    { kind: 'agent-message-end', id: 'a1' },
    { kind: 'thread-state', state: 'idle' },
  ] satisfies UiEvent[],
}
