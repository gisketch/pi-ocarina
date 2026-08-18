import { describe, expect, it } from 'vitest'
import {
  countOf,
  EMPTY_SURFACE,
  sourceOf,
  surfaceIsEmpty,
  type ProjectSurface,
} from './project-surface'

const CWD = '/repo'
const AGENT = '/home/me/.pi'
const APP = '/app/resources'

describe('where a resource came from', () => {
  it('names the three places apart', () => {
    expect(sourceOf('/repo/.pi/skills/a/SKILL.md', CWD, AGENT, APP)).toBe('project')
    expect(sourceOf('/home/me/.pi/skills/b/SKILL.md', CWD, AGENT, APP)).toBe('global')
    expect(sourceOf('/app/resources/skills/c/SKILL.md', CWD, AGENT, APP)).toBe('app')
  })

  it('checks the app first, so a repository cannot claim a shipped skill', () => {
    // A workspace opened at `/` would prefix-match everything.
    expect(sourceOf('/app/resources/skills/c/SKILL.md', '/', AGENT, APP)).toBe('app')
  })

  it('calls anything outside all three global rather than guessing', () => {
    expect(sourceOf('/elsewhere/SKILL.md', CWD, AGENT, APP)).toBe('global')
  })

  it('does not treat an empty root as matching everything', () => {
    expect(sourceOf('/repo/x', '', AGENT, '')).toBe('global')
  })
})

describe('whether there is anything to show', () => {
  it('is empty when nothing loaded', () => {
    expect(surfaceIsEmpty(EMPTY_SURFACE)).toBe(true)
  })

  it('is not empty when only a problem loaded', () => {
    const surface: ProjectSurface = {
      ...EMPTY_SURFACE,
      problems: [{ path: 'a', message: 'bad' }],
    }
    // A workspace whose only skill is broken has something important to say.
    expect(surfaceIsEmpty(surface)).toBe(false)
  })

  it('is not empty when only a system prompt source loaded', () => {
    expect(surfaceIsEmpty({ ...EMPTY_SURFACE, systemPromptSource: 'p.md' })).toBe(false)
  })
})

describe('counting', () => {
  it('uses real plurals rather than appending an s', () => {
    expect(countOf('skill', 1)).toBe('1 skill')
    expect(countOf('skill', 2)).toBe('2 skills')
    expect(countOf('command', 0)).toBe('0 commands')
    expect(countOf('file', 1)).toBe('1 file')
    expect(countOf('problem', 3)).toBe('3 problems')
  })
})
