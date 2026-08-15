import { describe, expect, it } from 'vitest'
import { isSendKey, planSend, sendHint } from './composer'

describe('planSend', () => {
  it('starts a turn on an idle thread', () => {
    expect(planSend('fix the test', 'idle')).toEqual({ action: 'prompt', text: 'fix the test' })
  })

  it('queues into a turn that is running', () => {
    expect(planSend('also cap retries', 'running')).toEqual({
      action: 'steer',
      text: 'also cap retries',
    })
  })

  it('starts a turn on a thread that already finished one', () => {
    expect(planSend('next thing', 'done').action).toBe('prompt')
  })

  it('starts a turn on a failed thread, so a failure is not a dead end', () => {
    expect(planSend('try again differently', 'failed').action).toBe('prompt')
  })

  it('starts a turn on an interrupted thread', () => {
    expect(planSend('carry on', 'interrupted').action).toBe('prompt')
  })

  it('queues while a card is pending mid-turn', () => {
    // `waiting-input` is a display status; the run state is what says whether a
    // turn is in flight. This case exists so a second turn cannot be started on
    // top of one that is still going.
    expect(planSend('meanwhile…', 'running').action).toBe('steer')
  })

  it('does nothing for an empty message', () => {
    expect(planSend('', 'idle')).toEqual({ action: 'none' })
    expect(planSend('   \n  ', 'running')).toEqual({ action: 'none' })
  })

  it('trims what it sends', () => {
    expect(planSend('  hello  ', 'idle')).toEqual({ action: 'prompt', text: 'hello' })
  })

  it('keeps newlines inside a multi-line message', () => {
    expect(planSend('one\ntwo', 'idle')).toEqual({ action: 'prompt', text: 'one\ntwo' })
  })
})

describe('isSendKey', () => {
  it('sends on enter', () => {
    expect(isSendKey({ key: 'Enter' })).toBe(true)
  })

  it('never sends on shift+enter', () => {
    expect(isSendKey({ key: 'Enter', shiftKey: true })).toBe(false)
  })

  it('ignores every other key', () => {
    expect(isSendKey({ key: 'a' })).toBe(false)
    expect(isSendKey({ key: 'Escape' })).toBe(false)
  })
})

describe('sendHint', () => {
  it('says what ⏎ will actually do', () => {
    expect(sendHint('running')).toBe('queue')
    expect(sendHint('idle')).toBe('send')
    expect(sendHint('done')).toBe('send')
  })
})
