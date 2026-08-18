import { describe, expect, it } from 'vitest'
import {
  allSlash,
  applySlash,
  filterSlash,
  resolveSlash,
  skillBackspace,
  skillsSaid,
  SLASH_COMMANDS,
  slashAt,
} from './slash'
import type { ProjectCommand } from '../../../shared/project-surface'

describe('the `/` token under the caret', () => {
  const at = (text: string) => slashAt(text, text.length)

  it('opens on a bare slash, and carries what follows it', () => {
    expect(at('/')?.query).toBe('')
    expect(at('/com')?.query).toBe('com')
  })

  it('says nothing when there is no slash', () => {
    expect(at('hello')).toBeNull()
  })

  it('ignores a slash inside a word, so a path is not a menu', () => {
    expect(at('look at src/lib')).toBeNull()
  })

  it('ends at a space, because by then they are writing prose', () => {
    expect(at('/compact the thread')).toBeNull()
    expect(at('/ ')).toBeNull()
    expect(at('/compact\nmore')).toBeNull()
  })

  it('opens mid-sentence, after whitespace', () => {
    // The whole point: naming a skill inside a sentence rather than instead
    // of one.
    const token = at('this is /human')
    expect(token?.query).toBe('human')
    expect(token?.start).toBe(8)
    expect(token?.leading).toBe(false)
  })

  it('is leading only when nothing else has been typed', () => {
    expect(at('/com')?.leading).toBe(true)
    expect(at('  /com')?.leading).toBe(true)
    expect(at('and /com')?.leading).toBe(false)
  })

  it('reads the token the caret is in, not the last one in the text', () => {
    const text = 'one /alpha two /beta'
    expect(slashAt(text, 9)?.query).toBe('alph')
  })
})

describe('writing a skill into a sentence', () => {
  const SKILL = {
    id: 'skill' as const,
    name: '/humanizer',
    label: 'humanizer',
    description: '',
    source: 'global' as const,
    prompt: '/skill:humanizer',
  }

  it('replaces the token and leaves the caret past it', () => {
    const text = 'this is /human and more'
    const token = slashAt(text, 14)!
    const next = applySlash(text, token, SKILL)

    // The name, not pi's syntax: a chip should read as the thing it names.
    // Two trailing spaces on purpose — cells for whatever chip is inserted
    // next; `planSend` trims them from the sent message.
    expect(next.text).toBe('this is /humanizer   and more')
    expect(next.text.slice(0, next.caret)).toBe('this is /humanizer  ')
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

const SKILLS = [
  { name: 'reviewer', description: 'review a change', source: 'project' as const, path: '.pi/skills/reviewer/SKILL.md', explicitOnly: false },
  { name: 'handoff', description: 'compact the conversation', source: 'global' as const, path: '~/.pi/skills/handoff/SKILL.md', explicitOnly: true },
]

describe('the workspace’s skills', () => {
  it('offers each one under the name pi expands', () => {
    // `/skill:name` is pi's own syntax — `prompt()` reads the file and wraps it
    // in a `<skill>` block before the model sees anything. The app sends the
    // name it shows and invents nothing.
    const skills = allSlash([], { skills: SKILLS })
    // Typed as `/reviewer`, drawn as `reviewer`, sent as `/skill:reviewer`.
    const one = skills.find((entry) => entry.name === '/reviewer')
    expect(one?.label).toBe('reviewer')
    expect(one?.prompt).toBe('/skill:reviewer')
    expect(skills.find((entry) => entry.name === '/handoff')?.prompt).toBe('/skill:handoff')
  })

  it('offers the ones the model cannot load itself, and says so', () => {
    const only = allSlash([], { skills: SKILLS }).find((one) => one.name === '/handoff')
    expect(only?.explicitOnly).toBe(true)
  })

  it('sorts them after the built-ins and the project’s own commands', () => {
    const ids = allSlash(PROJECT, { skills: SKILLS }).map((one) => one.id)
    expect(ids.lastIndexOf('project')).toBeLessThan(ids.indexOf('skill'))
  })

  it('finds one by the part of its name a reader remembers', () => {
    expect(filterSlash('review', [], { skills: SKILLS }).map((one) => one.name)).toContain(
      '/reviewer',
    )
  })

  it('is absent when the workspace loaded none', () => {
    expect(allSlash(PROJECT).some((one) => one.id === 'skill')).toBe(false)
  })

  it('resolves a typed name to the skill, not to a prefix nobody types', () => {
    expect(resolveSlash('/handoff', [], { skills: SKILLS })?.prompt).toBe('/skill:handoff')
  })

  it('lets a project command of the same name win, as a built-in does', () => {
    // The precedence the menu already states: the app's, then the
    // repository's, then a skill. A skill cannot capture a name a reader has
    // learnt means something else.
    const clash = [{ name: 'ship', description: 'the project’s', source: 'project' as const, path: 'x' }]
    const skill = [{ ...SKILLS[0], name: 'ship' }]
    expect(resolveSlash('/ship', clash, { skills: skill })?.id).toBe('project')
  })
})

describe('a skill in the sentence, on the way out', () => {
  const NAMES = ['humanizer', 'reviewer']

  it('becomes pi’s own syntax, everywhere it was named', () => {
    expect(skillsSaid('this is /humanizer and /reviewer', NAMES)).toBe(
      'this is /skill:humanizer and /skill:reviewer',
    )
  })

  it('leaves a slash that names no skill exactly as it was typed', () => {
    expect(skillsSaid('look at src/lib and /tmp', NAMES)).toBe('look at src/lib and /tmp')
  })

  it('leaves a message with none of them untouched', () => {
    expect(skillsSaid('plain words', NAMES)).toBe('plain words')
  })
})

describe('deleting a skill chip', () => {
  const NAMES = ['humanizer']

  it('takes the whole chip, not one character of it', () => {
    const text = 'this is /humanizer'
    expect(skillBackspace(text, text.length, NAMES)).toEqual({ text: 'this is ', caret: 8 })
  })

  it('does nothing when the caret is not just after one', () => {
    const text = 'this is /humanizer more'
    expect(skillBackspace(text, text.length, NAMES)).toBeNull()
    expect(skillBackspace(text, 12, NAMES)).toBeNull()
  })
})
