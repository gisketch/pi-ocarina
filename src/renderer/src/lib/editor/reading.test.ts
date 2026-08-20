import { describe, expect, it } from 'vitest'
import { isMarkdownPath, readsRendered } from './reading'
import type { Mode } from '../types'

describe('isMarkdownPath', () => {
  it('recognizes the markdown family, case-insensitively', () => {
    expect(isMarkdownPath('README.md')).toBe(true)
    expect(isMarkdownPath('docs/guide.markdown')).toBe(true)
    expect(isMarkdownPath('pages/index.mdx')).toBe(true)
    expect(isMarkdownPath('NOTES.MD')).toBe(true)
  })

  it('leaves everything else to the source editor', () => {
    expect(isMarkdownPath('main.ts')).toBe(false)
    expect(isMarkdownPath('md')).toBe(false)
    expect(isMarkdownPath('a.md.bak')).toBe(false)
    expect(isMarkdownPath('')).toBe(false)
  })
})

describe('readsRendered', () => {
  it('renders a focused markdown column in every strip mode', () => {
    for (const mode of ['OCARINA', 'READ', 'TERM', 'LEADER'] as Mode[]) {
      expect(readsRendered('README.md', true, mode)).toBe(true)
    }
  })

  it('shows the source while the reader is in vim on this column', () => {
    for (const mode of ['NORMAL', 'INSERT', 'VISUAL', 'LEAP'] as Mode[]) {
      expect(readsRendered('README.md', true, mode)).toBe(false)
    }
  })

  it('keeps an unfocused markdown column rendered while vim runs elsewhere', () => {
    expect(readsRendered('README.md', false, 'INSERT')).toBe(true)
  })

  it('never renders a non-markdown file', () => {
    expect(readsRendered('main.ts', true, 'OCARINA')).toBe(false)
    expect(readsRendered('main.ts', false, 'INSERT')).toBe(false)
  })
})
