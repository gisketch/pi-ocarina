import { describe, expect, it } from 'vitest'
import { langOf } from './lang-of'
import { isHighlighted } from '../renderer/src/lib/highlight'

describe('naming a file’s language', () => {
  it('reads the extension', () => {
    expect(langOf('src/app.ts')).toBe('ts')
    expect(langOf('Program.cs')).toBe('csharp')
    expect(langOf('main.go')).toBe('go')
  })

  it('agrees with itself about the same language spelled two ways', () => {
    expect(langOf('a.mjs')).toBe(langOf('a.js'))
    expect(langOf('a.yml')).toBe(langOf('a.yaml'))
  })

  it('ignores the directories above it', () => {
    expect(langOf('/a/b.ts/c/d.py')).toBe('python')
  })

  it('says nothing for a dotfile, whose name is not an extension', () => {
    expect(langOf('.gitignore')).toBe('')
    expect(langOf('src/.env')).toBe('')
  })

  it('says nothing it cannot name', () => {
    expect(langOf('Makefile')).toBe('')
    expect(langOf('notes.wat')).toBe('')
    expect(langOf('')).toBe('')
  })

  it('names languages the highlighter actually knows, where it knows them', () => {
    // The point of one table: a name from here is handed straight to the
    // highlighter, so a name it cannot use would silently paint nothing.
    for (const path of ['a.ts', 'a.py', 'a.json', 'a.css', 'a.sh', 'a.svelte']) {
      expect(isHighlighted(langOf(path))).toBe(true)
    }
  })
})
