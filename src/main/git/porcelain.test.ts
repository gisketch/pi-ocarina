import { describe, expect, it } from 'vitest'
import { parseStatus } from './porcelain'

const CLEAN = `# branch.oid 8f3c1a2b9d4e5f60718293a4b5c6d7e8f9012345
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`

describe('parseStatus', () => {
  it('reads a clean repository', () => {
    const status = parseStatus(CLEAN)

    expect(status).toEqual({
      branch: 'main',
      detached: false,
      ahead: 0,
      behind: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      untracked: 0,
      conflicts: 0,
    })
  })

  it('reads ahead and behind counts', () => {
    const status = parseStatus(`# branch.head main\n# branch.ab +3 -2\n`)

    expect(status.ahead).toBe(3)
    // git writes behind as a negative number; the count is what is shown.
    expect(status.behind).toBe(2)
  })

  it('counts a dirty tree by file', () => {
    const status = parseStatus(
      `${CLEAN}1 M. N... 100644 100644 100644 aaa bbb src/one.ts
1 .M N... 100644 100644 100644 aaa bbb src/two.ts
1 A. N... 000000 100644 100644 000 ccc src/new.ts
1 .D N... 100644 100644 000000 ddd ddd src/gone.ts
? src/untracked.ts
`,
    )

    expect(status).toMatchObject({ added: 1, modified: 2, deleted: 1, untracked: 1 })
  })

  it('counts a file that is both staged and edited once', () => {
    // Counting it twice would report more changed files than the repo has.
    const status = parseStatus(`1 MM N... 100644 100644 100644 aaa bbb src/one.ts\n`)

    expect(status).toMatchObject({ added: 0, modified: 1, deleted: 0 })
  })

  it('counts a rename as a modification', () => {
    const status = parseStatus(
      `2 R. N... 100644 100644 100644 aaa bbb R100 src/new.ts\tsrc/old.ts\n`,
    )

    expect(status.modified).toBe(1)
  })

  it('counts unmerged paths as conflicts', () => {
    const status = parseStatus(
      `${CLEAN}u UU N... 100644 100644 100644 100644 aaa bbb ccc src/clash.ts
u UU N... 100644 100644 100644 100644 aaa bbb ccc src/other.ts
`,
    )

    expect(status.conflicts).toBe(2)
  })

  it('shows the short commit when HEAD is detached', () => {
    const status = parseStatus(
      `# branch.oid 8f3c1a2b9d4e5f60718293a4b5c6d7e8f9012345\n# branch.head (detached)\n`,
    )

    expect(status.detached).toBe(true)
    expect(status.branch).toBe('8f3c1a2')
  })

  it('ignores ignored files and lines it has never seen', () => {
    const status = parseStatus(`${CLEAN}! build/output.js\nx something-new 1 2 3\n`)

    expect(status).toMatchObject({ added: 0, modified: 0, untracked: 0, conflicts: 0 })
  })

  it('survives empty output rather than inventing a branch', () => {
    expect(parseStatus('')).toMatchObject({ branch: '', ahead: 0, modified: 0 })
  })
})
