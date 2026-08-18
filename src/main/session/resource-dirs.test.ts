import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHIPPED_RESOURCES, shippedSkillPaths } from './resource-dirs'

describe('the folder this app ships resources from', () => {
  it('is found by walking up, not by trusting the working directory', () => {
    // `process.cwd()` in a packaged app is wherever the reader launched from.
    expect(SHIPPED_RESOURCES).not.toBe('')
    expect(existsSync(SHIPPED_RESOURCES)).toBe(true)
  })

  it('offers the skills folder to pi', () => {
    const paths = shippedSkillPaths()
    expect(paths).toHaveLength(1)
    expect(existsSync(paths[0])).toBe(true)
  })

  it('ships the skill creator, with the frontmatter pi requires', async () => {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(`${shippedSkillPaths()[0]}/skill-creator/SKILL.md`, 'utf8')

    // pi reads `name` and `description` out of the frontmatter; a skill missing
    // either is a diagnostic rather than a skill.
    expect(text.startsWith('---\n')).toBe(true)
    expect(text).toMatch(/^name: skill-creator$/m)
    expect(text).toMatch(/^description: .+/m)
  })
})
