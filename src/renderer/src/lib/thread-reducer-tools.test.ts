import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../../shared/protocol'
import { replayThread } from './thread-reducer'
import type { Block, ToolBody, ToolRow } from './thread'

const rows = (blocks: Block[]): ToolRow[] =>
  blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))

const withBody = (body: ToolBody): ToolRow => {
  const events: UiEvent[] = [
    { kind: 'tool-start', id: 't1', tool: 'edit', target: 'a.ts' },
    { kind: 'tool-body', id: 't1', body },
    { kind: 'tool-end', id: 't1', status: 'ok' },
  ]
  return rows(replayThread(events).blocks)[0]
}

describe('a row that changed a file', () => {
  it('arrives open, because the change is what the reader came to read', () => {
    expect(withBody({ type: 'diff', lines: [{ sign: '+', text: 'new', line: 1 }] }).open).toBe(true)
  })

  it('stays shut when there is nothing to open', () => {
    // A write that produced no diff, or an edit that replaced text with itself.
    // A row that opens on to nothing is worse than one that stays closed.
    const events: UiEvent[] = [
      { kind: 'tool-start', id: 't1', tool: 'write', target: 'a.ts' },
      { kind: 'tool-end', id: 't1', status: 'ok' },
    ]
    expect(rows(replayThread(events).blocks)[0].open).toBeUndefined()
  })

  it('leaves every other body closed', () => {
    expect(withBody({ type: 'code', lines: [{ text: 'x' }] }).open).toBeUndefined()
    expect(withBody({ type: 'terminal', lines: [{ text: 'x' }] }).open).toBeUndefined()
  })

  it('opens the same way on reopen as it did live', () => {
    // Replay and the live stream share this reducer, which is the only reason
    // the two agree. A row that opened live and not on reopen would be worse
    // than one that never opened.
    const body: ToolBody = { type: 'diff', lines: [{ sign: '-', text: 'gone', line: 4 }] }
    expect(withBody(body).open).toBe(true)
  })
})
