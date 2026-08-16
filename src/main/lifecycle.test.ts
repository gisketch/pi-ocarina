import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../shared/protocol'
import { createRunningTracker, shouldNotify } from './lifecycle'
import { quitMessage } from '../shared/quit'

// Electron's own surfaces (dialog, Notification, window events) are exercised by
// running the app; these are the decisions behind them.

const state = (value: 'done' | 'failed' | 'running' | 'idle'): UiEvent => ({
  kind: 'thread-state',
  state: value,
})

describe('shouldNotify', () => {
  it('announces a thread that finished out of sight', () => {
    expect(shouldNotify(state('done'), false, true)).toBe(true)
    expect(shouldNotify(state('failed'), false, true)).toBe(true)
  })

  it('stays quiet when the user is already looking at the app', () => {
    expect(shouldNotify(state('done'), true, true)).toBe(false)
    expect(shouldNotify(state('failed'), true, true)).toBe(false)
  })

  it('stays quiet for a thread that was never running', () => {
    expect(shouldNotify(state('done'), false, false)).toBe(false)
  })

  it('does not announce a thread that merely started or went idle', () => {
    expect(shouldNotify(state('running'), false, true)).toBe(false)
    expect(shouldNotify(state('idle'), false, true)).toBe(false)
  })

  it('ignores everything that is not a state change', () => {
    expect(shouldNotify({ kind: 'agent-message-delta', id: 'm', text: 'hi' }, false, true)).toBe(
      false,
    )
  })
})

describe('createRunningTracker', () => {
  it('reports a thread as previously running once its turn ends', () => {
    const wasRunning = createRunningTracker()

    wasRunning('t1', state('running'))

    expect(wasRunning('t1', state('done'))).toBe(true)
  })

  it('does not treat a replayed transcript as a finished turn', () => {
    const wasRunning = createRunningTracker()

    // Reopening a thread replays history and ends on `done`, with no `running`
    // before it — the user opened this themselves and needs no notification.
    expect(wasRunning('t1', state('done'))).toBe(false)
  })

  it('forgets a thread once it has settled', () => {
    const wasRunning = createRunningTracker()

    wasRunning('t1', state('running'))
    wasRunning('t1', state('done'))

    expect(wasRunning('t1', state('done'))).toBe(false)
  })

  it('tracks threads independently', () => {
    const wasRunning = createRunningTracker()

    wasRunning('t1', state('running'))

    expect(wasRunning('t2', state('done'))).toBe(false)
    expect(wasRunning('t1', state('done'))).toBe(true)
  })

  it('starts empty for each app run', () => {
    const first = createRunningTracker()
    first('t1', state('running'))

    expect(createRunningTracker()('t1', state('done'))).toBe(false)
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
