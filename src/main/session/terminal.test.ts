import { describe, expect, it, vi } from 'vitest'
import type { IPty } from 'node-pty'
import { TerminalService, type PtySpawn } from './terminal'

/** A pty that records what it was told and lets a test drive its callbacks. */
function fakePty(process = 'zsh') {
  const handlers: { data?: (d: string) => void; exit?: () => void } = {}
  const pty = {
    get process() {
      return pty._process
    },
    _process: process,
    written: [] as string[],
    killed: false,
    onData: (fn: (d: string) => void) => {
      handlers.data = fn
    },
    onExit: (fn: () => void) => {
      handlers.exit = fn
    },
    write: (d: string) => pty.written.push(d),
    resize: () => {},
    kill: () => {
      pty.killed = true
    },
  }
  return { pty: pty as unknown as IPty & typeof pty, handlers }
}

function service(spawns: ReturnType<typeof fakePty>[]) {
  let n = 0
  const emitted: [string, string][] = []
  const spawn: PtySpawn = () => spawns[n++].pty
  const terminals = new TerminalService({
    emit: (id, data) => emitted.push([id, data]),
    cwdOf: () => '/repo',
    spawn,
  })
  return { terminals, emitted }
}

describe('one shell per terminal id', () => {
  it('does not spawn a second shell when t is pressed twice quickly', async () => {
    const first = fakePty()
    const second = fakePty()
    const { terminals } = service([first, second])

    await Promise.all([terminals.create('term-1', 'w1'), terminals.create('term-1', 'w1')])

    terminals.write('term-1', 'hello')
    expect(first.pty.written).toEqual(['hello'])
    expect(second.pty.written).toEqual([])
  })

  it('lets a workspace start a fresh shell after its own exited', async () => {
    const first = fakePty()
    const second = fakePty()
    const { terminals } = service([first, second])

    await terminals.create('term-1', 'w1')
    first.handlers.exit?.()
    await terminals.create('term-1', 'w1')

    terminals.write('term-1', 'hello')
    expect(second.pty.written).toEqual(['hello'])
  })

  it('ignores a dead shell exiting after its replacement arrived', async () => {
    // SIGHUP is delivered asynchronously: the old shell's exit can land after
    // the new one exists, and forgetting by workspace alone would orphan it.
    const first = fakePty()
    const second = fakePty()
    const { terminals } = service([first, second])

    await terminals.create('term-1', 'w1')
    terminals.kill('term-1')
    await terminals.create('term-1', 'w1')
    first.handlers.exit?.()

    terminals.write('term-1', 'hello')
    expect(second.pty.written).toEqual(['hello'])
  })

  it('keeps two terminals in one workspace independent', async () => {
    const first = fakePty()
    const second = fakePty()
    const { terminals } = service([first, second])

    await terminals.create('term-1', 'w1')
    await terminals.create('term-2', 'w1')
    terminals.write('term-2', 'second only')
    terminals.kill('term-1')

    expect(first.pty.killed).toBe(true)
    expect(second.pty.killed).toBe(false)
    expect(first.pty.written).toEqual([])
    expect(second.pty.written).toEqual(['second only'])
  })
})

describe('whether the shell is busy', () => {
  it('is idle at its own prompt', async () => {
    const shell = fakePty('zsh')
    const { terminals } = service([shell])
    await terminals.create('term-1', 'w1')

    expect(terminals.busy('term-1')).toBe(false)
  })

  it('is busy while a command runs', async () => {
    const shell = fakePty('zsh')
    const { terminals } = service([shell])
    await terminals.create('term-1', 'w1')

    shell.pty._process = 'sleep'

    expect(terminals.busy('term-1')).toBe(true)
  })

  it('does not mistake sh for the zsh it is a suffix of', async () => {
    // "/bin/zsh".endsWith("sh") is true, and a suffix test would have called a
    // running script idle — killing it without asking.
    const shell = fakePty('zsh')
    const { terminals } = service([shell])
    await terminals.create('term-1', 'w1')

    shell.pty._process = 'sh'

    expect(terminals.busy('term-1')).toBe(true)
  })

  it('says a workspace with no shell is not busy', () => {
    const { terminals } = service([])

    expect(terminals.busy('never-started')).toBe(false)
  })
})

describe('output', () => {
  it('coalesces a burst into one message', async () => {
    vi.useFakeTimers()
    const shell = fakePty()
    const { terminals, emitted } = service([shell])
    await terminals.create('term-1', 'w1')

    shell.handlers.data?.('one ')
    shell.handlers.data?.('two ')
    shell.handlers.data?.('three')
    expect(emitted).toEqual([])

    vi.advanceTimersByTime(20)
    expect(emitted).toEqual([['term-1', 'one two three']])
    vi.useRealTimers()
  })

  it('stops emitting once the shell is killed', async () => {
    vi.useFakeTimers()
    const shell = fakePty()
    const { terminals, emitted } = service([shell])
    await terminals.create('term-1', 'w1')

    shell.handlers.data?.('late output')
    terminals.kill('term-1')
    vi.advanceTimersByTime(50)

    expect(emitted).toEqual([])
    expect(shell.pty.killed).toBe(true)
    vi.useRealTimers()
  })

  it('kills every shell when the app goes away', async () => {
    const a = fakePty()
    const b = fakePty()
    const { terminals } = service([a, b])
    await terminals.create('term-1', 'w1')
    await terminals.create('term-2', 'w2')

    terminals.disposeAll()

    expect(a.pty.killed).toBe(true)
    expect(b.pty.killed).toBe(true)
  })

  it('kills every shell owned by an unpinned workspace', async () => {
    const a = fakePty()
    const b = fakePty()
    const other = fakePty()
    const { terminals } = service([a, b, other])
    await terminals.create('term-1', 'w1')
    await terminals.create('term-2', 'w1')
    await terminals.create('term-3', 'w2')

    terminals.killWorkspace('w1')

    expect(a.pty.killed).toBe(true)
    expect(b.pty.killed).toBe(true)
    expect(other.pty.killed).toBe(false)
  })
})
