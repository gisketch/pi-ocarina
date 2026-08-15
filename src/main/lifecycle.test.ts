import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../shared/protocol'
import { quitMessage, shouldNotify } from './lifecycle'

// Electron's own surfaces (dialog, Notification, window events) are exercised by
// running the app; these are the decisions behind them.

const state = (value: 'done' | 'failed' | 'running' | 'idle'): UiEvent => ({
  kind: 'thread-state',
  state: value,
})

describe('shouldNotify', () => {
  it('announces a thread that finished out of sight', () => {
    expect(shouldNotify(state('done'), false)).toBe(true)
    expect(shouldNotify(state('failed'), false)).toBe(true)
  })

  it('stays quiet when the user is already looking at the app', () => {
    expect(shouldNotify(state('done'), true)).toBe(false)
    expect(shouldNotify(state('failed'), true)).toBe(false)
  })

  it('does not announce a thread that merely started or went idle', () => {
    expect(shouldNotify(state('running'), false)).toBe(false)
    expect(shouldNotify(state('idle'), false)).toBe(false)
  })

  it('ignores everything that is not a state change', () => {
    expect(shouldNotify({ kind: 'agent-message-delta', id: 'm', text: 'hi' }, false)).toBe(false)
    expect(shouldNotify({ kind: 'usage', contextPercent: 1, tokens: 2, costUsd: 0 }, false)).toBe(
      false,
    )
  })
})

describe('quitMessage', () => {
  it('counts a single thread in the singular', () => {
    expect(quitMessage(1).message).toBe('1 thread is still working.')
  })

  it('counts several in the plural', () => {
    expect(quitMessage(3).message).toBe('3 threads are still working.')
  })

  it('promises that transcripts survive either way', () => {
    expect(quitMessage(2).detail).toMatch(/saved/)
  })
})
