import { beforeEach, describe, expect, it } from 'vitest'
import { confirm } from './confirm.svelte'

const QUESTION = {
  title: 'discard changes',
  message: 'Discard 2 uncommitted edits?',
  confirmLabel: 'discard',
}

beforeEach(() => {
  confirm.answer(false)
})

describe('the destructive confirm', () => {
  it('is not pending until something asks', () => {
    expect(confirm.pending).toBe(false)
    expect(confirm.request).toBeNull()
  })

  it('resolves true when the user confirms', async () => {
    const answered = confirm.ask(QUESTION)
    expect(confirm.pending).toBe(true)

    confirm.answer(true)

    await expect(answered).resolves.toBe(true)
    expect(confirm.request).toBeNull()
  })

  it('resolves false when the user cancels', async () => {
    const answered = confirm.ask(QUESTION)

    confirm.answer(false)

    await expect(answered).resolves.toBe(false)
  })

  it('takes enter as yes and escape as no', async () => {
    const yes = confirm.ask(QUESTION)
    expect(confirm.handleKey({ key: 'Enter' })).toBe(true)
    await expect(yes).resolves.toBe(true)

    const no = confirm.ask(QUESTION)
    expect(confirm.handleKey({ key: 'Escape' })).toBe(true)
    await expect(no).resolves.toBe(false)
  })

  it('swallows every other key rather than letting a binding run underneath', () => {
    void confirm.ask(QUESTION)

    expect(confirm.handleKey({ key: 'x' })).toBe(true)
    expect(confirm.pending).toBe(true)
  })

  it('lets a bare modifier through, so reaching for a capital answers nothing', () => {
    void confirm.ask(QUESTION)

    expect(confirm.handleKey({ key: 'Shift' })).toBe(false)
    expect(confirm.pending).toBe(true)
  })

  it('refuses a second question rather than stacking one over the other', async () => {
    const first = confirm.ask(QUESTION)

    await expect(confirm.ask({ ...QUESTION, title: 'quit' })).resolves.toBe(false)
    expect(confirm.request?.title).toBe('discard changes')

    confirm.answer(true)
    await expect(first).resolves.toBe(true)
  })
})
