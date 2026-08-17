import { beforeEach, describe, expect, it } from 'vitest'
import { chooseWorktree, worktreeAsk } from './worktree-ask.svelte'

function press(key: string): boolean {
  return worktreeAsk.handleKey({ key })
}

function type(text: string): void {
  for (const key of text) press(key)
}

beforeEach(() => {
  // The question is a singleton, like every other modal in the shell.
  if (worktreeAsk.open) worktreeAsk.no()
  worktreeAsk.refuse('')
})

describe('chooseWorktree', () => {
  it('never asks about a folder that is not a repository', async () => {
    expect(await chooseWorktree(false)).toBeNull()
    expect(worktreeAsk.open).toBe(false)
  })

  it('asks in a repository', async () => {
    const answer = chooseWorktree(true)
    expect(worktreeAsk.open).toBe(true)

    press('Escape')
    expect(await answer).toBeNull()
  })
})

describe('the answer', () => {
  it('takes enter as no', async () => {
    const answer = worktreeAsk.ask()
    press('Enter')

    expect(await answer).toBeNull()
    expect(worktreeAsk.open).toBe(false)
  })

  it('takes esc as no', async () => {
    const answer = worktreeAsk.ask()
    press('Escape')

    expect(await answer).toBeNull()
  })

  it('takes y then a name', async () => {
    const answer = worktreeAsk.ask()
    press('y')
    type('fix/OCA-231')
    press('Enter')

    expect(await answer).toEqual({ branch: 'fix/OCA-231' })
  })

  it('will not confirm an illegal name', async () => {
    const answer = worktreeAsk.ask()
    press('y')
    type('fix..bad')
    press('Enter')

    expect(worktreeAsk.open).toBe(true)
    expect(worktreeAsk.problem).toBe('no ..')

    press('Backspace')
    press('Backspace')
    press('Backspace')
    press('Backspace')
    press('Backspace')
    expect(worktreeAsk.problem).toBeNull()
    press('Enter')
    expect(await answer).toEqual({ branch: 'fix' })
  })

  it('will not confirm an empty name', () => {
    void worktreeAsk.ask()
    press('y')

    expect(worktreeAsk.ready).toBe(false)
    press('Enter')
    expect(worktreeAsk.open).toBe(true)
    worktreeAsk.no()
  })

  it('goes back to the question rather than out of it', async () => {
    const answer = worktreeAsk.ask()
    press('y')
    type('wip')
    press('Escape')

    expect(worktreeAsk.open).toBe(true)
    expect(worktreeAsk.naming).toBe(false)
    expect(worktreeAsk.branch).toBe('')

    press('Enter')
    expect(await answer).toBeNull()
  })

  it('says so when git already refused the name', () => {
    worktreeAsk.refuse('taken')
    void worktreeAsk.ask()
    press('y')
    type('taken')

    expect(worktreeAsk.problem).toBe('that branch already exists')
    expect(worktreeAsk.ready).toBe(false)
    worktreeAsk.no()
  })

  it('lets a bare modifier through, so shift is not an answer', () => {
    void worktreeAsk.ask()

    expect(press('Shift')).toBe(false)
    expect(worktreeAsk.open).toBe(true)
    worktreeAsk.no()
  })
})
