import { describe, expect, it } from 'vitest'
import { collapseSkills, markSkillNodes, markSkills } from './skill-chips'
import { parseMarkdown } from './thread'
import type { InlineSegment } from './thread'

/** A skill the reader named travels as pi's expanded `<skill>` block — a wall
 *  of instructions in the transcript where the composer showed one chip. Both
 *  are the same thing, so both draw the same: one chip, the bare name. */

const BLOCK = `what does <skill name="sonata-grill" location="/Users/x/.agents/skills/sonata-grill/SKILL.md"> References are relative to /Users/x.

# Sonata Grill

Resolve design branches.

1. Read facts first.
</skill> do?`

describe('collapsing the expanded block', () => {
  it('folds the whole block to pi’s short form, keeping the sentence around it', () => {
    expect(collapseSkills(BLOCK)).toBe('what does /skill:sonata-grill do?')
  })

  it('folds every block in the message', () => {
    const two = `<skill name="a" location="x">one</skill> and <skill name="b" location="y">two</skill>`
    expect(collapseSkills(two)).toBe('/skill:a and /skill:b')
  })

  it('leaves a block quoted inside a code fence exactly as written', () => {
    const fenced = 'look:\n```\n<skill name="a" location="x">body</skill>\n```\ndone'
    expect(collapseSkills(fenced)).toBe(fenced)
  })

  it('leaves an unclosed tag alone rather than eating the rest of the message', () => {
    const open = 'mind the <skill name="a" location="x"> tag'
    expect(collapseSkills(open)).toBe(open)
  })

  it('passes plain text through untouched', () => {
    expect(collapseSkills('no skills here')).toBe('no skills here')
  })
})

describe('marking the short form as a chip', () => {
  const plain = (text: string): InlineSegment => ({ text, code: false })

  it('splits the run and carries the bare name', () => {
    expect(markSkills([plain('do /skill:reviewer now')])).toEqual([
      { text: 'do ', code: false },
      { text: 'reviewer', code: false, skill: 'reviewer' },
      { text: ' now', code: false },
    ])
  })

  it('marks one at the very start', () => {
    expect(markSkills([plain('/skill:reviewer go')])[0]).toEqual({
      text: 'reviewer',
      code: false,
      skill: 'reviewer',
    })
  })

  it('leaves a code span quoted, not referred to', () => {
    const code: InlineSegment = { text: '/skill:reviewer', code: true }
    expect(markSkills([code])).toEqual([code])
  })

  it('leaves a slash mid-word alone', () => {
    expect(markSkills([plain('path/skill:odd')])).toEqual([plain('path/skill:odd')])
  })
})

describe('the full pass over a parsed message', () => {
  it('one chip where the wall of instructions was', () => {
    const nodes = markSkillNodes(parseMarkdown(collapseSkills(BLOCK)))
    expect(nodes).toHaveLength(1)
    const paragraph = nodes[0]
    if (paragraph.type !== 'paragraph') throw new Error('expected a paragraph')

    const chip = paragraph.segments.find((one) => one.skill)
    expect(chip?.text).toBe('sonata-grill')
    expect(paragraph.segments.map((one) => one.text).join('')).toBe(
      'what does sonata-grill do?',
    )
  })
})
