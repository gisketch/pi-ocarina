/** The ledger's vocabulary: which row a call gets, and what its label says.
 *
 *  Separate from the translator's own tests because this is a different
 *  question. The translator turns pi's events into ours; these two functions
 *  decide what a reader sees written on a row. */

import { describe, expect, it } from 'vitest'
import { toolKind, toolTarget } from './pi-translate'

describe('toolKind', () => {
  it('maps pi built-ins onto design rows', () => {
    expect(toolKind('bash')).toBe('bash')
    expect(toolKind('read')).toBe('read')
    expect(toolKind('grep')).toBe('grep')
  })

  it('leaves tools with no design row as raw rather than mislabelling them', () => {
    expect(toolKind('find')).toBe('raw')
    expect(toolKind('ls')).toBe('raw')
    expect(toolKind('some_extension_tool')).toBe('raw')
  })

  it('reads a SKILL.md as a skill, wherever it sits', () => {
    expect(toolKind('read', { path: '.pi/skills/reviewer/SKILL.md' })).toBe('skill')
    expect(toolKind('read', { file_path: '/Users/x/.pi/skills/deep/nest/SKILL.md' })).toBe('skill')
  })

  it('does not mistake a file merely named like one', () => {
    expect(toolKind('read', { path: 'docs/skill.md' })).toBe('read')
    expect(toolKind('read', { path: 'docs/MY-SKILL.md' })).toBe('read')
    expect(toolKind('read', { path: 'SKILL.md.bak' })).toBe('read')
    expect(toolKind('read', { path: 'src/app.ts' })).toBe('read')
  })

  it('only a read loads a skill — a write to one is still a write', () => {
    expect(toolKind('write', { path: '.pi/skills/new/SKILL.md' })).toBe('write')
    expect(toolKind('edit', { path: '.pi/skills/new/SKILL.md' })).toBe('edit')
  })

  it('survives a read with no path at all', () => {
    expect(toolKind('read', undefined)).toBe('read')
    expect(toolKind('read', { path: 42 })).toBe('read')
  })
})

describe('a skill row', () => {
  it('says which skill, not which file — every skill file has the same name', () => {
    expect(toolTarget('read', { path: '.pi/skills/reviewer/SKILL.md' })).toBe('reviewer')
    expect(toolTarget('read', { file_path: '/a/b/agent-lsp/SKILL.md' })).toBe('agent-lsp')
  })

  it('falls back rather than drawing an empty label', () => {
    // A SKILL.md with no folder above it names no skill, so the row says the
    // only true thing left.
    expect(toolTarget('read', { path: 'SKILL.md' })).toBe('skill')
    expect(toolTarget('read', { path: '/SKILL.md' })).toBe('skill')
  })
})

describe('toolTarget', () => {
  it('labels a file tool with its path', () => {
    expect(toolTarget('read', { path: 'src/app.ts' })).toBe('src/app.ts')
  })

  it('labels bash with the command', () => {
    expect(toolTarget('bash', { command: 'pnpm test' })).toBe('pnpm test')
  })

  it('labels grep with the pattern, quoted the way the design draws it', () => {
    expect(toolTarget('grep', { pattern: 'TODO' })).toBe('"TODO"')
  })

  it('says what a search looked for, not where it looked', () => {
    // `path` used to be picked first, so this row read `.` — the one word the
    // reader wanted was the one thrown away.
    expect(toolTarget('grep', { pattern: 'export', path: '.' })).toBe('"export"')
  })

  it('adds where it looked when that is worth saying', () => {
    expect(toolTarget('grep', { pattern: 'export', path: 'src' })).toBe('"export" · src')
  })

  it('names a tool the design has no row for, so its row is not just a path', () => {
    // `ls` and `find` are labelled `tool`, so without the name the row read
    // `tool .` and said nothing at all.
    expect(toolTarget('ls', { path: '.' })).toBe('ls .')
  })

  it('still names a tool it does not recognise', () => {
    expect(toolTarget('mystery', { depth: 2 })).toContain('mystery')
  })

  it('survives missing arguments', () => {
    expect(toolTarget('mystery', undefined)).toBe('mystery')
  })
})

describe('a search by a tool the design has no row for', () => {
  it('keeps its name, the way every other raw row does', () => {
    // `find` is labelled `tool`, so without the name the row read `tool "x"`.
    expect(toolTarget('find', { pattern: '*.ts', path: 'src' })).toBe('find "*.ts" · src')
  })
})
