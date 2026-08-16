import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChangeLog } from './change-log'
import { countChanges, diffLines } from './file-diff'

let cwd = ''
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'change-perf-'))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

/** A file of `lines` lines, as an agent's source file would be. */
const source = (lines: number, mark: string): string =>
  Array.from({ length: lines }, (_, i) => `  const value${i} = ${mark}${i}`).join('\n')

describe('a thread that edited a lot', () => {
  it('holds its budget across 200 edits over 40 files', () => {
    // The shape J6 asks for. Two things are being measured: the snapshots, and
    // the merged diff the viewer asks for at the end.
    const log = new ChangeLog()
    const files = Array.from({ length: 40 }, (_, i) => join(cwd, `file${i}.ts`))
    for (const path of files) writeFileSync(path, source(400, 'a'))

    const started = performance.now()
    for (let round = 0; round < 5; round += 1) {
      files.forEach((path, i) => {
        const id = `call-${round}-${i}`
        log.start(id, path, cwd)
        writeFileSync(path, source(400, 'a').replace(`value${round * 7}`, `renamed${round}`))
        log.end('t1', id)
      })
    }
    const edits = performance.now() - started

    const merging = performance.now()
    const changed = log.changes('t1')
    const total = changed.reduce((sum, change) => {
      const lines = diffLines(change.before, change.after, { path: change.path })
      return sum + countChanges(lines).added
    }, 0)
    const merged = performance.now() - merging

    expect(changed).toHaveLength(40)
    expect(total).toBeGreaterThan(0)
    // Generous against a fast machine, tight enough to catch a quadratic: the
    // whole run is 200 snapshot pairs of a 400-line file, and 40 merged diffs.
    expect(edits).toBeLessThan(2000)
    expect(merged).toBeLessThan(500)
  })

  it('keeps two versions of a file, not two hundred', () => {
    // The memory shape matters as much as the time: a thread that edits one
    // file fifty times must not hold fifty copies of it.
    const log = new ChangeLog()
    const path = join(cwd, 'a.ts')
    writeFileSync(path, source(200, 'a'))

    for (let i = 0; i < 50; i += 1) {
      log.start(`c${i}`, path, cwd)
      writeFileSync(path, source(200, `v${i}`))
      log.end('t1', `c${i}`)
    }

    const changes = log.changes('t1')
    expect(changes).toHaveLength(1)
    // First against last, and nothing in between.
    expect(changes[0].before).toContain('a0')
    expect(changes[0].after).toContain('v490')
  })
})
