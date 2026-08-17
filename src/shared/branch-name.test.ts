import { describe, expect, it } from 'vitest'
import { validateBranchName, worktreeDirName } from './branch-name'

describe('validateBranchName', () => {
  it('accepts what a person actually types', () => {
    for (const name of ['fix/OCA-231', 'feat/diff-gutter', 'main', 'wip', 'a/b/c', 'v1.2-work']) {
      expect(validateBranchName(name), name).toBeNull()
    }
  })

  it('names the rule that was broken', () => {
    expect(validateBranchName('')).toBe('a branch needs a name')
    expect(validateBranchName('fix the gutter')).toMatch(/no spaces/)
    expect(validateBranchName('fix..gutter')).toBe('no ..')
    expect(validateBranchName('feat/a~b')).toMatch(/no spaces/)
    expect(validateBranchName('/lead')).toMatch(/leading or trailing/)
    expect(validateBranchName('trail/')).toMatch(/leading or trailing/)
    expect(validateBranchName('a//b')).toBe('no empty path segment')
    expect(validateBranchName('.hidden')).toBe('no segment starting with .')
    expect(validateBranchName('feat/.hidden')).toBe('no segment starting with .')
    expect(validateBranchName('work.')).toBe('no trailing .')
    expect(validateBranchName('feat/thing.lock')).toBe('no .lock ending')
    expect(validateBranchName('@')).toMatch(/not a branch name/)
    expect(validateBranchName('a@{b')).toBe('no @{')
  })

  it('rejects what git rejects, character for character', () => {
    for (const name of ['a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b']) {
      expect(validateBranchName(name), name).not.toBeNull()
    }
  })
})

describe('worktreeDirName', () => {
  it('flattens the branch into one directory', () => {
    expect(worktreeDirName('fix/OCA-231')).toBe('fix-OCA-231')
    expect(worktreeDirName('wip')).toBe('wip')
  })
})
