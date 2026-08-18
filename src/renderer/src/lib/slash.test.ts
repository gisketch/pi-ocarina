import { describe, expect, it } from 'vitest'
import { allSlash, filterSlash, resolveSlash, SLASH_COMMANDS, slashQuery } from './slash'
import type { ProjectCommand } from '../../../shared/project-surface'

describe('slashQuery', () => {
  it('opens on a bare slash', () => {
    expect(slashQuery('/')).toBe('')
  })

  it('reads the word being typed', () => {
    expect(slashQuery('/com')).toBe('com')
  })

  it('stays closed for text that does not start with a slash', () => {
    expect(slashQuery('hello')).toBeNull()
  })

  it('does not open on a path in the middle of a sentence', () => {
    // Popping a command menu while someone writes `src/lib` would fight them.
    expect(slashQuery('look at src/lib')).toBeNull()
  })

  it('closes once a space is typed, because that is prose now', () => {
    expect(slashQuery('/compact the thread')).toBeNull()
    expect(slashQuery('/ ')).toBeNull()
  })

  it('closes on a newline too', () => {
    expect(slashQuery('/compact\nmore')).toBeNull()
  })
})

describe('filterSlash', () => {
  it('lists everything for an empty query', () => {
    expect(filterSlash('')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('narrows as the query grows', () => {
    expect(filterSlash('mod').map((c) => c.id)).toEqual(['model'])
  })

  it('returns nothing for a query that matches no command', () => {
    expect(filterSlash('zzz')).toEqual([])
  })
})

describe('resolveSlash', () => {
  it('recognises a command typed in full', () => {
    expect(resolveSlash('/compact')?.id).toBe('compact')
  })

  it('ignores surrounding whitespace', () => {
    expect(resolveSlash('  /model  ')?.id).toBe('model')
  })

  it('does not resolve a partial name', () => {
    // `/comp` is not `/compact`; sending it as text is honest, guessing is not.
    expect(resolveSlash('/comp')).toBeNull()
  })

  it('treats an unknown slash word as ordinary text', () => {
    expect(resolveSlash('/shrug')).toBeNull()
  })

  it('treats a message that merely contains a slash as ordinary text', () => {
    expect(resolveSlash('check src/lib/thread.ts')).toBeNull()
  })
})

const PROJECT: ProjectCommand[] = [
  { name: 'ship', description: 'run the checks, then commit', source: 'project', path: 'a.md' },
  { name: 'commit', description: 'the repository’s own commit ritual', source: 'project', path: 'b.md' },
  { name: 'note', description: 'a command from this machine', source: 'global', path: 'c.md' },
]

describe('a project’s own commands', () => {
  it('appear after the built-ins, never instead of them', () => {
    const names = allSlash(PROJECT).map((one) => one.name)
    expect(names.slice(0, SLASH_COMMANDS.length)).toEqual(SLASH_COMMANDS.map((one) => one.name))
    expect(names).toContain('/ship')
  })

  it('says where each one came from', () => {
    const by = new Map(allSlash(PROJECT).map((one) => [one.name + one.source, one.source]))
    expect(by.get('/shipproject')).toBe('project')
    expect(by.get('/noteglobal')).toBe('global')
    expect(by.get('/commitbuilt-in')).toBe('built-in')
  })

  it('shows both when a project command shares a built-in’s name', () => {
    const both = filterSlash('commit', PROJECT).map((one) => one.source)
    expect(both).toEqual(['built-in', 'project'])
  })

  it('resolves a typed name to the built-in, whatever the repository ships', () => {
    // `/commit` opens the commit card. A repository that could capture it would
    // change what a control in the app does.
    expect(resolveSlash('/commit', PROJECT)?.id).toBe('commit')
  })

  it('resolves a project-only name to the project command', () => {
    const command = resolveSlash('/ship', PROJECT)
    expect(command?.id).toBe('project')
    expect(command?.prompt).toBe('/ship')
  })

  it('leaves a name nobody defines as literal text', () => {
    expect(resolveSlash('/shrug', PROJECT)).toBeNull()
  })

  it('behaves as before for a workspace that defines nothing', () => {
    expect(filterSlash('')).toHaveLength(SLASH_COMMANDS.length)
    expect(resolveSlash('/model')?.id).toBe('model')
  })
})

describe('a column with no thread behind it', () => {
  it('keeps the project’s commands, which is what the first message is sent under', () => {
    // The hero column is the one most likely to receive the first message, and
    // the reader who has just closed every thread is looking at nothing else.
    const names = allSlash(PROJECT, { hasThread: false }).map((one) => one.name)
    expect(names).toContain('/ship')
  })

  it('drops the two that need a session, rather than erroring on them', () => {
    const ids = allSlash(PROJECT, { hasThread: false }).map((one) => one.id)
    expect(ids).not.toContain('compact')
    expect(ids).not.toContain('reload')
    // Everything else is about the folder, so it stays.
    expect(ids).toContain('commit')
    expect(ids).toContain('model')
  })

  it('does not resolve a typed command it does not offer', () => {
    expect(resolveSlash('/compact', PROJECT, { hasThread: false })).toBeNull()
    expect(resolveSlash('/compact', PROJECT)?.id).toBe('compact')
  })
})
