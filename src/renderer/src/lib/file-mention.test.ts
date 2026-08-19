import { describe, expect, it } from 'vitest'
import { asFileMention } from './file-mention'

const FILES = new Set([
  'src/main/index.ts',
  'src/renderer/src/App.svelte',
  'docs/quality.md',
  'weird:2',
])
const contains = (path: string): boolean => FILES.has(path)

describe('asFileMention', () => {
  it('resolves a plain path that is in the workspace', () => {
    expect(asFileMention('src/main/index.ts', contains)).toEqual({
      path: 'src/main/index.ts',
      line: null,
    })
  })

  it('splits a :line suffix and keeps the number', () => {
    expect(asFileMention('docs/quality.md:12', contains)).toEqual({
      path: 'docs/quality.md',
      line: 12,
    })
  })

  it('drops a :line:column suffix down to the line', () => {
    expect(asFileMention('src/main/index.ts:5:14', contains)).toEqual({
      path: 'src/main/index.ts',
      line: 5,
    })
  })

  it('accepts a leading ./', () => {
    expect(asFileMention('./docs/quality.md', contains)).toEqual({
      path: 'docs/quality.md',
      line: null,
    })
  })

  it('lets a file whose own name ends in :digits win over the split', () => {
    expect(asFileMention('weird:2', contains)).toEqual({ path: 'weird:2', line: null })
  })

  it('stays plain code for a path the workspace does not have', () => {
    expect(asFileMention('src/ghost.ts', contains)).toBeNull()
    expect(asFileMention('src/ghost.ts:12', contains)).toBeNull()
  })

  it('stays plain code for a directory, a snippet, or an escape attempt', () => {
    expect(asFileMention('src/main', contains)).toBeNull()
    expect(asFileMention('const a = 1', contains)).toBeNull()
    expect(asFileMention('../outside/file.ts', contains)).toBeNull()
    expect(asFileMention('', contains)).toBeNull()
  })
})
