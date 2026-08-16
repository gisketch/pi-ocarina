import { describe, expect, it } from 'vitest'
import type { GitStatus } from '../../../shared/protocol'
import { branchLabel, summarize } from './git-format'

function status(counts: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: 'main',
    detached: false,
    ahead: 0,
    behind: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    untracked: 0,
    conflicts: 0,
    ...counts,
  }
}

const text = (s: GitStatus | null): string =>
  summarize(s)
    .map((segment) => segment.text)
    .join(' ')

describe('summarize', () => {
  it('says nothing at all about a folder that is not a repository', () => {
    expect(summarize(null)).toEqual([])
  })

  it('says clean when the working tree is clean', () => {
    expect(text(status())).toBe('✓ clean')
  })

  it('writes the reference grammar', () => {
    expect(text(status({ ahead: 1, added: 1, modified: 1 }))).toBe('↑1 +1 ~1')
  })

  it('counts untracked files as added', () => {
    expect(text(status({ added: 1, untracked: 2 }))).toBe('+3')
  })

  it('leaves out every count that is zero', () => {
    expect(text(status({ modified: 2 }))).toBe('~2')
  })

  it('still says clean when the branch is only ahead', () => {
    // Being ahead of the remote is not dirt.
    expect(text(status({ ahead: 1 }))).toBe('↑1 ✓ clean')
  })

  it('shows behind as well as ahead', () => {
    expect(text(status({ ahead: 2, behind: 3 }))).toBe('↑2 ↓3 ✓ clean')
  })

  it('shows conflicts instead of counts while a merge is unresolved', () => {
    expect(text(status({ conflicts: 2, modified: 4 }))).toBe('!2 conflicts')
  })

  it('says one conflict in the singular', () => {
    expect(text(status({ conflicts: 1 }))).toBe('!1 conflict')
  })

  it('keeps ahead and behind next to a conflict', () => {
    expect(text(status({ ahead: 1, conflicts: 1 }))).toBe('↑1 !1 conflict')
  })

  it('colours each part the way the reference does', () => {
    expect(summarize(status({ ahead: 1, added: 1, modified: 1, deleted: 1 }))).toEqual([
      { text: '↑1', tone: 'warn' },
      { text: '+1', tone: 'ok' },
      { text: '~1', tone: 'warn' },
      { text: '-1', tone: 'bad' },
    ])
  })
})

describe('branchLabel', () => {
  it('is empty for a folder that is not a repository', () => {
    expect(branchLabel(null)).toBe('')
  })

  it('is the branch name', () => {
    expect(branchLabel(status({ branch: 'feat/palette' }))).toBe('feat/palette')
  })

  it('marks a detached HEAD so its commit cannot read as a branch', () => {
    expect(branchLabel(status({ branch: '8f3c1a2', detached: true }))).toBe('@8f3c1a2')
  })
})
