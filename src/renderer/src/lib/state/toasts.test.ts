import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toasts } from './toasts.svelte'

beforeEach(() => {
  vi.useFakeTimers()
  toasts.reset()
})

afterEach(() => {
  toasts.reset()
  vi.useRealTimers()
})

describe('the toast stack', () => {
  it('shows what it was given', () => {
    toasts.push({ tone: 'ok', text: 'thread finished', label: 'view' })

    expect(toasts.items).toMatchObject([{ tone: 'ok', text: 'thread finished', label: 'view' }])
  })

  it('gives every toast an id of its own', () => {
    const first = toasts.push({ tone: 'ok', text: 'one' })
    const second = toasts.push({ tone: 'ok', text: 'one' })

    expect(first).not.toBe(second)
  })

  it('stacks newest last', () => {
    toasts.push({ tone: 'ok', text: 'first' })
    toasts.push({ tone: 'error', text: 'second' })

    expect(toasts.items.map((toast) => toast.text)).toEqual(['first', 'second'])
  })

  it('takes a success down after its time', () => {
    toasts.push({ tone: 'ok', text: 'done' })

    vi.advanceTimersByTime(6000)

    expect(toasts.items).toEqual([])
  })

  it('leaves a failure up longer than a success', () => {
    toasts.push({ tone: 'error', text: 'failed' })

    vi.advanceTimersByTime(6000)
    expect(toasts.items).toHaveLength(1)

    vi.advanceTimersByTime(6000)
    expect(toasts.items).toEqual([])
  })

  it('drops the oldest rather than growing past what the eye can take in', () => {
    for (const text of ['a', 'b', 'c', 'd', 'e']) toasts.push({ tone: 'info', text })

    expect(toasts.items.map((toast) => toast.text)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('cancels the timer of a toast it dropped', () => {
    // A dismiss firing for an id that has left the stack would take an
    // unrelated toast's place in the list with it.
    for (const text of ['a', 'b', 'c', 'd', 'e']) toasts.push({ tone: 'info', text })

    vi.advanceTimersByTime(6000)

    expect(toasts.items).toEqual([])
  })

  it('dismisses one by hand', () => {
    const id = toasts.push({ tone: 'ok', text: 'one' })
    toasts.push({ tone: 'ok', text: 'two' })

    toasts.dismiss(id)

    expect(toasts.items.map((toast) => toast.text)).toEqual(['two'])
  })

  it('does not fire again for a toast already dismissed', () => {
    const id = toasts.push({ tone: 'ok', text: 'one' })
    toasts.dismiss(id)
    toasts.push({ tone: 'ok', text: 'two' })

    vi.advanceTimersByTime(6000)

    expect(toasts.items).toEqual([])
  })
})
