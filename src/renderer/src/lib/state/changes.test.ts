import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangedFile } from '../../../../shared/protocol'

vi.mock('../session', () => ({ session: { invoke: vi.fn() } }))
vi.mock('./app.svelte', () => ({ app: { mode: 'NORMAL' } }))

const { changes } = await import('./changes.svelte')

const file = (path: string, lines: ChangedFile['lines']): ChangedFile => ({
  path,
  added: lines.filter((line) => line.sign === '+').length,
  removed: lines.filter((line) => line.sign === '-').length,
  existed: true,
  lines,
})

/** Context, a change, context, a change — the shape `n` has to walk. */
const twoHunks = file('a.ts', [
  { sign: ' ', text: 'one', line: 1 },
  { sign: '+', text: 'two', line: 2 },
  { sign: '+', text: 'three', line: 3 },
  { sign: ' ', text: 'four', line: 4 },
  { sign: ' ', text: 'five', line: 5 },
  { sign: '-', text: 'six', line: 6 },
  { sign: ' ', text: 'seven', line: 7 },
])

const load = (files: ChangedFile[]): void => {
  changes.close()
  changes.threadId = 't1'
  changes.files = files
}

beforeEach(() => changes.close())

describe('moving through the files', () => {
  it('clamps at both ends rather than wrapping', () => {
    load([twoHunks, file('b.ts', [])])

    changes.handleKey({ key: 'k' })
    expect(changes.at).toBe(0)

    changes.handleKey({ key: 'j' })
    changes.handleKey({ key: 'j' })
    expect(changes.at).toBe(1)
  })

  it('switches pane on tab, and on the horizontal keys', () => {
    load([twoHunks])

    changes.handleKey({ key: 'Tab' })
    expect(changes.pane).toBe('diff')
    changes.handleKey({ key: 'h' })
    expect(changes.pane).toBe('files')
    changes.handleKey({ key: 'l' })
    expect(changes.pane).toBe('diff')
  })

  it('moves through lines once the diff has the keys', () => {
    load([twoHunks])
    changes.handleKey({ key: 'l' })

    changes.handleKey({ key: 'j' })
    expect(changes.line).toBe(1)
  })

  it('goes to the ends on gg and G', () => {
    load([twoHunks, file('b.ts', []), file('c.ts', [])])

    changes.handleKey({ key: 'G' })
    expect(changes.at).toBe(2)

    changes.handleKey({ key: 'g' })
    changes.handleKey({ key: 'g' })
    expect(changes.at).toBe(0)
  })

  it('does not treat a lone g as gg', () => {
    load([twoHunks, file('b.ts', [])])
    changes.handleKey({ key: 'G' })

    changes.handleKey({ key: 'g' })
    changes.handleKey({ key: 'j' })
    changes.handleKey({ key: 'g' })
    // The j between them broke the chord: this g starts a new one.
    expect(changes.at).toBe(1)
  })
})

describe('stepping hunks', () => {
  it('steps to the next run of changes, not the next changed line', () => {
    // Twelve additions in a row are one hunk. Stepping to each of them would
    // make n mean the same thing as j.
    load([twoHunks])

    changes.handleKey({ key: 'n' })
    expect(changes.line).toBe(1)

    changes.handleKey({ key: 'n' })
    expect(changes.line).toBe(5)
  })

  it('crosses into the next file when this one has no more', () => {
    const second = file('b.ts', [
      { sign: ' ', text: 'a', line: 1 },
      { sign: '+', text: 'b', line: 2 },
    ])
    load([twoHunks, second])

    changes.handleKey({ key: 'n' })
    changes.handleKey({ key: 'n' })
    changes.handleKey({ key: 'n' })

    expect(changes.at).toBe(1)
    expect(changes.line).toBe(1)
  })

  it('stays put at the last hunk of the last file', () => {
    load([twoHunks])
    changes.handleKey({ key: 'G' })
    changes.handleKey({ key: 'n' })
    changes.handleKey({ key: 'n' })
    const settled = changes.line

    changes.handleKey({ key: 'n' })
    expect(changes.line).toBe(settled)
  })
})

describe('the filter', () => {
  it('takes every key once it is open, including the ones that are bindings', () => {
    load([file('src/app.ts', []), file('src/keyboard.ts', [])])

    changes.handleKey({ key: '/' })
    changes.handleKey({ key: 'k' })
    changes.handleKey({ key: 'e' })

    expect(changes.filter).toBe('ke')
    expect(changes.shown.map((entry) => entry.path)).toEqual(['src/keyboard.ts'])
  })

  it('leaves the filter on esc, not the viewer', () => {
    // A reader who typed a filter is not asking to close the thing they are
    // reading.
    load([file('a.ts', [])])
    changes.handleKey({ key: '/' })
    changes.handleKey({ key: 'a' })

    changes.handleKey({ key: 'Escape' })

    expect(changes.filter).toBe('')
    expect(changes.open).toBe(true)
  })

  it('keeps listening after backspace empties it', () => {
    load([file('a.ts', [])])
    changes.handleKey({ key: '/' })
    changes.handleKey({ key: 'a' })
    changes.handleKey({ key: 'Backspace' })

    changes.handleKey({ key: 'b' })
    expect(changes.filter).toBe('b')
  })

  it('closes the viewer on esc when no filter is open', () => {
    load([file('a.ts', [])])

    changes.handleKey({ key: 'Escape' })
    expect(changes.open).toBe(false)
  })
})

describe('a thread that is still editing', () => {
  it('keeps the reader on the file they were reading', () => {
    // A file appended above the one being read would otherwise slide it out
    // from under the cursor.
    const a = file('a.ts', [])
    const b = file('b.ts', [])
    load([a, b])
    changes.handleKey({ key: 'j' })
    expect(changes.file?.path).toBe('b.ts')

    changes.absorb([file('new.ts', []), a, b])

    expect(changes.file?.path).toBe('b.ts')
  })

  it('does not move a reader whose file went away', () => {
    load([file('a.ts', [])])
    changes.absorb([])
    expect(changes.file).toBeNull()
  })
})

describe('when the backend cannot answer', () => {
  it('says so rather than reporting no changes', async () => {
    // The two look identical in the data and mean opposite things: one is "the
    // agent changed nothing", the other is "we do not know what it changed".
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockRejectedValueOnce(new Error('no session backend'))

    await changes.show('t1')

    expect(changes.error).toBe('no session backend')
    expect(changes.files).toEqual([])
    expect(changes.open).toBe(true)
  })

  it('clears the error on the next open', async () => {
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [] } as never)

    await changes.show('t1')
    expect(changes.error).toBeNull()
  })
})

describe('stepping hunks across files', () => {
  const changedFirstLine = file('b.ts', [
    { sign: '+', text: 'first', line: 1 },
    { sign: ' ', text: 'second', line: 2 },
    { sign: '-', text: 'third', line: 3 },
  ])

  it('does not skip a file whose diff starts on a changed line', () => {
    // Entering the next file at line 0 and then looking for the *next* hunk
    // steps straight over a change sitting on line 0.
    load([twoHunks, changedFirstLine])
    changes.handleKey({ key: 'G' })
    changes.handleKey({ key: 'g' })
    changes.handleKey({ key: 'g' })

    changes.handleKey({ key: 'n' })
    changes.handleKey({ key: 'n' })
    changes.handleKey({ key: 'n' })

    expect(changes.at).toBe(1)
    expect(changes.line).toBe(0)
  })

  it('lands on the start of the previous run when walking back', () => {
    // Backwards used to land at the top of the previous file, or on a run's
    // last line — so N then n did not return where n had been.
    load([twoHunks])
    changes.handleKey({ key: 'l' })
    changes.handleKey({ key: 'G' })

    changes.handleKey({ key: 'N' })
    expect(changes.line).toBe(5)

    changes.handleKey({ key: 'N' })
    expect(changes.line).toBe(1)
  })

  it('enters the previous file at its last hunk, not its top', () => {
    load([twoHunks, changedFirstLine])
    changes.handleKey({ key: 'G' })
    changes.handleKey({ key: 'l' })
    changes.handleKey({ key: 'G' })

    changes.handleKey({ key: 'N' })
    expect(changes.at).toBe(1)
    expect(changes.line).toBe(0)

    changes.handleKey({ key: 'N' })
    expect(changes.at).toBe(0)
    expect(changes.line).toBe(5)
  })
})

describe('which file a row opens', () => {
  it('does not mistake a path that merely ends the same way', async () => {
    // `vendor/src/a.ts` ends with `src/a.ts`. Opening the viewer there would
    // show the reader a file they did not point at.
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({
      files: [file('src/a.ts', []), file('vendor/src/a.ts', [])],
    } as never)

    await changes.show('t1', '/work/vendor/src/a.ts')

    expect(changes.file?.path).toBe('vendor/src/a.ts')
  })
})

describe('leaving the viewer', () => {
  it('hands the keyboard back to the mode that opened it', async () => {
    const { app } = await import('./app.svelte')
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [] } as never)

    app.mode = 'READ'
    await changes.show('t1')
    changes.handleKey({ key: 'Escape' })

    expect(app.mode).toBe('READ')
    expect(changes.open).toBe(false)
  })

  it('returns to the strip when that is where it came from', async () => {
    const { app } = await import('./app.svelte')
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [] } as never)

    app.mode = 'NORMAL'
    await changes.show('t1')
    changes.handleKey({ key: 'Escape' })

    expect(app.mode).toBe('NORMAL')
  })
})

describe('following a thread that is still working', () => {
  it('re-reads when a tool call ends on the thread it is watching', async () => {
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [] } as never)
    await changes.show('t1')

    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [file('late.ts', [])] } as never)
    await changes.refreshFor('t1')

    expect(changes.files.map((entry) => entry.path)).toEqual(['late.ts'])
  })

  it('ignores a thread it is not watching', async () => {
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [] } as never)
    await changes.show('t1')
    vi.mocked(session.invoke).mockClear()

    await changes.refreshFor('t2')
    expect(vi.mocked(session.invoke)).not.toHaveBeenCalled()
  })

  it('keeps what the reader has when a refresh fails', async () => {
    const { session } = await import('../session')
    vi.mocked(session.invoke).mockResolvedValueOnce({ files: [file('a.ts', [])] } as never)
    await changes.show('t1')

    vi.mocked(session.invoke).mockRejectedValueOnce(new Error('gone'))
    await changes.refreshFor('t1')

    expect(changes.files.map((entry) => entry.path)).toEqual(['a.ts'])
    expect(changes.error).toBeNull()
  })
})
