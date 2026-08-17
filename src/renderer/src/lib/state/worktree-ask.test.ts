import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../session', () => ({ session: { invoke: (...args: unknown[]) => invoke(...args) } }))

const { worktreeAsk } = await import('./worktree-ask.svelte')

function press(key: string): boolean {
  return worktreeAsk.handleKey({ key })
}

function type(text: string): void {
  for (const key of text) press(key)
}

/** Stands in for `catalog.newThread`: records what tree was asked for. */
let asked: ({ branch: string } | null)[] = []
let answer: string | null = 't1'

function make(choice: { branch: string } | null): Promise<string | null> {
  asked.push(choice)
  return Promise.resolve(answer)
}

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({ worktrees: [] })
  asked = []
  answer = 't1'
  if (worktreeAsk.open) worktreeAsk.no()
})

describe('the answer', () => {
  it('takes enter as no, and still makes the thread', async () => {
    const thread = worktreeAsk.run('w1', make)
    press('Enter')

    expect(await thread).toBe('t1')
    expect(asked).toEqual([null])
    expect(worktreeAsk.open).toBe(false)
  })

  it('takes esc as no', async () => {
    const thread = worktreeAsk.run('w1', make)
    press('Escape')

    expect(await thread).toBe('t1')
    expect(asked).toEqual([null])
  })

  it('takes y then a name', async () => {
    const thread = worktreeAsk.run('w1', make)
    press('y')
    type('fix/OCA-231')
    press('Enter')

    expect(await thread).toBe('t1')
    expect(asked).toEqual([{ branch: 'fix/OCA-231' }])
  })

  it('will not confirm an illegal name', async () => {
    const thread = worktreeAsk.run('w1', make)
    press('y')
    type('fix..bad')
    press('Enter')

    expect(worktreeAsk.open).toBe(true)
    expect(worktreeAsk.problem).toBe('no ..')
    expect(asked).toEqual([])

    for (let i = 0; i < 5; i += 1) press('Backspace')
    expect(worktreeAsk.problem).toBeNull()
    press('Enter')
    expect(await thread).toBe('t1')
    expect(asked).toEqual([{ branch: 'fix' }])
  })

  it('refuses a name the workspace already uses, before asking git', async () => {
    invoke.mockResolvedValue({
      worktrees: [{ branch: 'fix/taken', path: '/repo/.ocarina/worktrees/fix-taken', dirty: 0, commits: 0 }],
    })

    void worktreeAsk.run('w1', make)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('listWorktrees', { workspaceId: 'w1' }))
    press('y')
    type('fix/taken')

    expect(worktreeAsk.problem).toBe('that branch already exists')
    press('Enter')
    expect(asked).toEqual([])
    worktreeAsk.no()
  })

  it('goes back to the question rather than out of it', async () => {
    const thread = worktreeAsk.run('w1', make)
    press('y')
    type('wip')
    press('Escape')

    expect(worktreeAsk.open).toBe(true)
    expect(worktreeAsk.naming).toBe(false)
    expect(worktreeAsk.branch).toBe('')

    press('Enter')
    expect(await thread).toBe('t1')
  })

  it('lets a bare modifier through, so shift is not an answer', () => {
    void worktreeAsk.run('w1', make)

    expect(press('Shift')).toBe(false)
    expect(worktreeAsk.open).toBe(true)
    worktreeAsk.no()
  })
})

describe('while git runs', () => {
  it('holds the dialog up as the pending state', async () => {
    let settle: (id: string | null) => void = () => {}
    const slow = (choice: { branch: string } | null): Promise<string | null> => {
      asked.push(choice)
      return new Promise((resolve) => {
        settle = resolve
      })
    }

    const thread = worktreeAsk.run('w1', slow)
    press('y')
    type('wip')
    press('Enter')

    expect(worktreeAsk.creating).toBe(true)
    // Nothing may be answered while a checkout is halfway made.
    press('Escape')
    expect(worktreeAsk.open).toBe(true)

    settle('t9')
    expect(await thread).toBe('t9')
    expect(worktreeAsk.open).toBe(false)
  })

  it('keeps the field open when git refused, and remembers the name', async () => {
    answer = null
    void worktreeAsk.run('w1', make)
    press('y')
    type('fix/no')
    press('Enter')

    await vi.waitFor(() => expect(worktreeAsk.creating).toBe(false))
    expect(worktreeAsk.open).toBe(true)
    expect(worktreeAsk.naming).toBe(true)
    expect(worktreeAsk.failure).toBe('git would not make that worktree')
    expect(worktreeAsk.problem).toBe('that branch already exists')

    worktreeAsk.no()
  })

  it('gives up when the plain thread could not be made either', async () => {
    answer = null
    const thread = worktreeAsk.run('w1', make)
    press('Enter')

    expect(await thread).toBeNull()
    expect(worktreeAsk.open).toBe(false)
  })
})
