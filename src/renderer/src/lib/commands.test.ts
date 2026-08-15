import { describe, expect, it } from 'vitest'
import { COMMANDS, filterCommands, scoreCommand, wrapIndex } from './commands'

describe('command palette contents', () => {
  it('lists the reference commands in order', () => {
    expect(COMMANDS.map((c) => c.id)).toEqual([
      'jump-workspace',
      'new-thread',
      'next-thread',
      'switch-branch',
      'compact-thread',
      'open-keymap',
    ])
  })
})

describe('scoreCommand', () => {
  it('treats an empty query as a match for everything', () => {
    expect(scoreCommand('Open keymap', '')).toBe(0)
    expect(scoreCommand('Open keymap', '   ')).toBe(0)
  })

  it('matches subsequences, not just prefixes', () => {
    expect(scoreCommand('New thread in this workspace', 'ntw')).not.toBeNull()
    expect(scoreCommand('Open keymap', 'keymap')).not.toBeNull()
  })

  it('is case-insensitive', () => {
    expect(scoreCommand('Open keymap', 'KEY')).not.toBeNull()
  })

  it('rejects non-matches', () => {
    expect(scoreCommand('Open keymap', 'zzz')).toBeNull()
    expect(scoreCommand('Open keymap', 'pk')).not.toBeNull()
    expect(scoreCommand('Open keymap', 'mk')).toBeNull() // wrong order
  })

  it('scores contiguous matches better than scattered ones', () => {
    const contiguous = scoreCommand('Switch branch', 'switch')
    const scattered = scoreCommand('Switch branch', 'sbh')
    expect(contiguous).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(contiguous!).toBeLessThan(scattered!)
  })
})

describe('filterCommands', () => {
  it('returns everything for an empty query, in declaration order', () => {
    expect(filterCommands(COMMANDS, '')).toEqual([...COMMANDS])
  })

  it('narrows to matching commands', () => {
    const results = filterCommands(COMMANDS, 'thread')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((c) => /thread/i.test(c.label))).toBe(true)
  })

  it('ranks the best match first', () => {
    expect(filterCommands(COMMANDS, 'compact')[0].id).toBe('compact-thread')
    expect(filterCommands(COMMANDS, 'keymap')[0].id).toBe('open-keymap')
    expect(filterCommands(COMMANDS, 'jump')[0].id).toBe('jump-workspace')
  })

  it('returns nothing when no command matches', () => {
    expect(filterCommands(COMMANDS, 'xyzzy')).toEqual([])
  })
})

describe('wrapIndex', () => {
  it('cycles at both ends', () => {
    expect(wrapIndex(0, 3)).toBe(0)
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(4, 3)).toBe(1)
  })

  it('is safe on an empty list', () => {
    expect(wrapIndex(-1, 0)).toBe(0)
  })
})
