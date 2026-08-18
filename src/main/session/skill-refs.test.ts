import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandSkillRefs } from './skill-refs'

async function skill(name: string, body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-skill-'))
  const file = join(dir, 'SKILL.md')
  await writeFile(file, `---\nname: ${name}\n---\n\n${body}\n`, 'utf8')
  return file
}

const sessionWith = (skills: { name: string; filePath: string }[]): unknown => ({
  resourceLoader: { getSkills: () => ({ skills }) },
})

describe('a skill named inside a sentence', () => {
  it('is replaced by the skill, wherever it sits', async () => {
    // pi expands one skill, at position zero. The composer lets a reader name
    // two in one message, and neither of them is at position zero.
    const one = await skill('alpha', 'do the alpha thing')
    const two = await skill('beta', 'do the beta thing')
    const session = sessionWith([
      { name: 'alpha', filePath: one },
      { name: 'beta', filePath: two },
    ])

    const said = expandSkillRefs(session, 'first /skill:alpha then /skill:beta please')

    expect(said).toContain('<skill name="alpha"')
    expect(said).toContain('do the alpha thing')
    expect(said).toContain('<skill name="beta"')
    expect(said).toContain('do the beta thing')
    expect(said.startsWith('first ')).toBe(true)
    expect(said.endsWith(' please')).toBe(true)
  })

  it('strips the frontmatter, the way pi does', async () => {
    const file = await skill('alpha', 'the body')
    const said = expandSkillRefs(sessionWith([{ name: 'alpha', filePath: file }]), '/skill:alpha')

    expect(said).not.toContain('---')
    expect(said).toContain('the body')
  })

  it('leaves a name nothing answers to exactly as it was typed', async () => {
    const file = await skill('alpha', 'body')
    const text = 'try /skill:nope and /skill:alpha'
    const said = expandSkillRefs(sessionWith([{ name: 'alpha', filePath: file }]), text)

    expect(said).toContain('/skill:nope')
    expect(said).toContain('<skill name="alpha"')
  })

  it('ignores one inside a word, the way the picker does', async () => {
    const file = await skill('alpha', 'body')
    const text = 'see docs/skill:alpha'
    expect(expandSkillRefs(sessionWith([{ name: 'alpha', filePath: file }]), text)).toBe(text)
  })

  it('leaves text alone when nothing names a skill', () => {
    expect(expandSkillRefs(sessionWith([]), 'plain words')).toBe('plain words')
  })

  it('survives a session with no loader, and a file it cannot read', () => {
    expect(expandSkillRefs({}, '/skill:alpha')).toBe('/skill:alpha')
    const gone = sessionWith([{ name: 'alpha', filePath: '/nowhere/SKILL.md' }])
    expect(expandSkillRefs(gone, '/skill:alpha')).toBe('/skill:alpha')
  })
})
