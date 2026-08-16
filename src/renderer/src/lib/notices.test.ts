import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../../shared/protocol'
import { noticesFor } from './notices'

const running = { focused: false, wasRunning: true }
const idle = { focused: false, wasRunning: false }

const done: UiEvent = { kind: 'thread-state', state: 'done' }
const failed: UiEvent = { kind: 'thread-state', state: 'failed', reason: 'provider gave up' }

describe('noticesFor', () => {
  it('says nothing about the thread the user is looking at', () => {
    expect(noticesFor([done, failed], { focused: true, wasRunning: true })).toEqual([])
  })

  it('reports a background thread that finished', () => {
    expect(noticesFor([done], running)).toEqual([
      { tone: 'ok', text: 'thread finished', label: 'view' },
    ])
  })

  it('reports a background thread that failed, with the reason', () => {
    expect(noticesFor([failed], running)).toEqual([
      { tone: 'error', text: 'thread failed — provider gave up', label: 'view' },
    ])
  })

  it('names a failure that came with no reason rather than trailing off', () => {
    const bare: UiEvent = { kind: 'thread-state', state: 'failed' }

    expect(noticesFor([bare], running)[0].text).toBe('thread failed — no reason given')
  })

  it('stays quiet when a thread that was not running reports done', () => {
    // Reopening a thread replays its history and ends on `done`.
    expect(noticesFor([done], idle)).toEqual([])
  })

  it('reports an approval nobody is watching', () => {
    const approve: UiEvent = { kind: 'approve', id: 'a1', command: 'rm -rf build' }

    expect(noticesFor([approve], idle)).toEqual([
      { tone: 'info', text: 'approval needed — rm -rf build', label: 'view' },
    ])
  })

  it('reports a compaction that happened out of sight', () => {
    const compacted: UiEvent = {
      kind: 'compaction-done',
      id: 'c1',
      beforePercent: 42,
      afterPercent: 18,
      summary: '…',
    }

    expect(noticesFor([compacted], idle)).toEqual([
      { tone: 'info', text: 'context compacted 42% → 18%', label: 'view' },
    ])
  })

  it('ignores the events that are not worth interrupting anyone for', () => {
    const noise: UiEvent[] = [
      { kind: 'agent-message-delta', id: 'm1', text: 'hello' },
      { kind: 'tool-end', id: 't1', status: 'ok' },
      { kind: 'thread-state', state: 'running' },
    ]

    expect(noticesFor(noise, running)).toEqual([])
  })

  it('keeps every notice in a batch, in order', () => {
    const approve: UiEvent = { kind: 'approve', id: 'a1', command: 'ls' }

    expect(noticesFor([approve, done], running).map((n) => n.tone)).toEqual(['info', 'ok'])
  })
})
