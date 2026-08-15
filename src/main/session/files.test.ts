import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isIgnored, listWorkspaceFiles, parseIgnore } from './files'

async function workspace(files: Record<string, string>): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'piocarina-files-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(cwd, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
  return cwd
}

describe('parseIgnore', () => {
  it('reads plain patterns', () => {
    expect(parseIgnore('dist\n*.log')).toEqual([
      { pattern: 'dist', directoryOnly: false, negated: false },
      { pattern: '*.log', directoryOnly: false, negated: false },
    ])
  })

  it('drops comments and blank lines', () => {
    expect(parseIgnore('# a comment\n\n  \ndist')).toHaveLength(1)
  })

  it('marks a directory-only rule', () => {
    expect(parseIgnore('build/')[0]).toMatchObject({ pattern: 'build', directoryOnly: true })
  })

  it('marks a negation', () => {
    expect(parseIgnore('!keep.log')[0]).toMatchObject({ pattern: 'keep.log', negated: true })
  })

  it('strips a leading slash, which anchors rather than names', () => {
    expect(parseIgnore('/root.txt')[0].pattern).toBe('root.txt')
  })
})

describe('isIgnored', () => {
  const rules = parseIgnore('*.log\nbuild/\n!keep.log')

  it('ignores a matching file', () => {
    expect(isIgnored(rules, 'debug.log', false)).toBe(true)
  })

  it('keeps a file a later negation rescues', () => {
    expect(isIgnored(rules, 'keep.log', false)).toBe(false)
  })

  it('applies a directory-only rule to directories only', () => {
    expect(isIgnored(rules, 'build', true)).toBe(true)
    expect(isIgnored(rules, 'build', false)).toBe(false)
  })

  it('leaves unmatched paths alone', () => {
    expect(isIgnored(rules, 'src/app.ts', false)).toBe(false)
  })
})

describe('listWorkspaceFiles', () => {
  it('lists the files in a workspace', async () => {
    const cwd = await workspace({ 'a.ts': '', 'src/b.ts': '' })

    expect(await listWorkspaceFiles(cwd)).toEqual(['a.ts', 'src/b.ts'])
  })

  it('honours .gitignore', async () => {
    const cwd = await workspace({ '.gitignore': '*.log\n', 'a.ts': '', 'debug.log': '' })

    expect(await listWorkspaceFiles(cwd)).toEqual(['.gitignore', 'a.ts'])
  })

  it('never walks node_modules, whatever the ignore file says', async () => {
    // Walking it would take longer than every other folder combined.
    const cwd = await workspace({ 'a.ts': '', 'node_modules/pkg/index.js': '' })

    expect(await listWorkspaceFiles(cwd)).toEqual(['a.ts'])
  })

  it('never walks .git', async () => {
    const cwd = await workspace({ 'a.ts': '', '.git/config': '' })

    expect(await listWorkspaceFiles(cwd)).toEqual(['a.ts'])
  })

  it('sorts shallow paths first, because those are what people mean', async () => {
    const cwd = await workspace({ 'deep/nested/README.md': '', 'README.md': '' })

    expect(await listWorkspaceFiles(cwd)).toEqual(['README.md', 'deep/nested/README.md'])
  })

  it('stops at the limit rather than freezing on a huge repository', async () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 40; i += 1) many[`file-${i}.txt`] = ''
    const cwd = await workspace(many)

    expect(await listWorkspaceFiles(cwd, 10)).toHaveLength(10)
  })

  it('returns nothing for a folder it cannot read', async () => {
    expect(await listWorkspaceFiles('/no/such/folder')).toEqual([])
  })
})
