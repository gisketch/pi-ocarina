// What replay must settle before it hands a thread over: names that would
// collide with the live stream's, and calls that never reported back.
import type { SessionEntry } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiTranslator } from './pi-translate'
import { replayEntries, stripAnsi } from './replay'

/** Session-file shapes, fabricated. Casting keeps fixtures to the fields the
 *  replay actually reads. */
const entries = (...list: unknown[]): SessionEntry[] => list as SessionEntry[]

const message = (id: string, message: unknown): unknown => ({ type: 'message', id, message })

describe('replay and live ids share no namespace', () => {
  it('names replayed agent messages apart from the live translator’s', () => {
    // Both sides can only count: pi gives a text part no id of its own. Two
    // counters that each start at one named different messages the same thing
    // the moment a live turn ran on a thread read back from disk.
    const events = replayEntries(
      entries(
        message('a1', { role: 'assistant', content: [{ type: 'text', text: 'one' }] }),
        message('a2', { role: 'assistant', content: [{ type: 'text', text: 'two' }] }),
      ),
    )

    const ids = [...new Set(events.filter((e) => e.kind.startsWith('agent-message')).map((e) => ('id' in e ? e.id : '')))]
    expect(ids).toEqual(['replay-msg-1', 'replay-msg-2'])
    expect(ids.some((id) => /^msg-\d+$/.test(id))).toBe(false)
  })

  it('leaves a replayed thread and a live turn with no key in common', () => {
    const replayed = replayEntries(
      entries(
        message('u1', { role: 'user', content: [{ type: 'text', text: 'hi' }] }),
        message('a1', { role: 'assistant', content: [{ type: 'text', text: 'hello' }] }),
      ),
    )

    // What the live translator produces for the first agent reply of a turn.
    const live = new PiTranslator().translate({
      type: 'message_start',
      message: { role: 'assistant' },
    } as never)
    expect(live.length).toBeGreaterThan(0)

    const key = (e: { kind: string; id?: string }) => `${e.kind}:${e.id ?? ''}`
    const replayedKeys = new Set(replayed.map((e) => key(e as never)))
    for (const event of live) expect(replayedKeys.has(key(event as never))).toBe(false)
  })
})

describe('a tool call the transcript never finished', () => {
  it('settles as cancelled instead of pulsing forever', () => {
    // The turn was interrupted while bash was running, so the session file has
    // the call and no result. Left open, the row claims to be working on
    // something nothing is working on.
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 't1', name: 'bash', arguments: { command: 'bun test' } }],
        }),
        message('u2', { role: 'user', content: [{ type: 'text', text: 'stop testing' }] }),
        message('a2', { role: 'assistant', content: [{ type: 'text', text: 'paused' }] }),
      ),
    )

    expect(events).toContainEqual({ kind: 'tool-end', id: 't1', status: 'cancelled' })
  })

  it('leaves a call that did report back alone', () => {
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'a.ts' } }],
        }),
        message('r1', { role: 'toolResult', toolCallId: 't1', toolName: 'read', content: [], isError: false }),
      ),
    )

    const ends = events.filter((event) => event.kind === 'tool-end')
    expect(ends).toEqual([{ kind: 'tool-end', id: 't1', status: 'ok' }])
  })

  it('settles every unfinished call, not just the last', () => {
    const events = replayEntries(
      entries(
        message('a1', {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 't1', name: 'bash', arguments: { command: 'one' } },
            { type: 'toolCall', id: 't2', name: 'bash', arguments: { command: 'two' } },
          ],
        }),
      ),
    )

    const cancelled = events.filter((e) => e.kind === 'tool-end' && e.status === 'cancelled')
    expect(cancelled.map((e) => ('id' in e ? e.id : ''))).toEqual(['t1', 't2'])
  })
})
