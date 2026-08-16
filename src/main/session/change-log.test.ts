import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHANGING_TOOLS, ChangeLog } from './change-log'

let cwd = ''
const write = (name: string, text: string): string => {
  const path = join(cwd, name)
  writeFileSync(path, text)
  return path
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'change-log-'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('one call', () => {
  it('reports what the call did to the file', () => {
    const log = new ChangeLog()
    write('a.ts', 'one\n')

    log.start('call-1', 'a.ts', cwd)
    write('a.ts', 'one\ntwo\n')

    expect(log.end('t1', 'call-1')).toEqual({
      path: join(cwd, 'a.ts'),
      before: 'one\n',
      after: 'one\ntwo\n',
    })
  })

  it('reads a file that does not exist yet as empty', () => {
    // This is the whole of the `write` case: nothing before, everything after,
    // which renders as all additions without a special case anywhere.
    const log = new ChangeLog()

    log.start('call-1', 'new.ts', cwd)
    write('new.ts', 'fresh\n')

    expect(log.end('t1', 'call-1')).toEqual({
      path: join(cwd, 'new.ts'),
      before: '',
      after: 'fresh\n',
    })
  })

  it('takes an absolute path as given', () => {
    const log = new ChangeLog()
    const path = write('a.ts', 'x')

    log.start('call-1', path, cwd)
    expect(log.end('t1', 'call-1')?.path).toBe(path)
  })

  it('knows nothing about a call it never saw start', () => {
    // A tool kind we do not snapshot, or a call from before this thread was
    // adopted. Either way the row falls back to what pi said about it.
    expect(new ChangeLog().end('t1', 'unknown')).toBeNull()
  })

  it('does not answer the same call twice', () => {
    const log = new ChangeLog()
    write('a.ts', 'x')
    log.start('call-1', 'a.ts', cwd)

    expect(log.end('t1', 'call-1')).not.toBeNull()
    expect(log.end('t1', 'call-1')).toBeNull()
  })

  it('refuses a file too large to hold two copies of', () => {
    const log = new ChangeLog()
    write('big.js', 'x'.repeat(500_000))

    log.start('call-1', 'big.js', cwd)
    expect(log.end('t1', 'call-1')?.before).toBe('')
  })
})

describe('a file edited more than once', () => {
  it('keeps the first before, not the most recent one', () => {
    // The trap: remembering the second edit's starting point would erase the
    // first edit from the viewer, which is exactly the history it is for.
    const log = new ChangeLog()
    write('a.ts', 'v1\n')

    log.start('call-1', 'a.ts', cwd)
    write('a.ts', 'v2\n')
    log.end('t1', 'call-1')

    log.start('call-2', 'a.ts', cwd)
    write('a.ts', 'v3\n')
    log.end('t1', 'call-2')

    expect(log.changes('t1')).toEqual([{ path: join(cwd, 'a.ts'), before: 'v1\n', after: 'v3\n' }])
  })

  it('drops a file whose edits cancelled out', () => {
    const log = new ChangeLog()
    write('a.ts', 'original\n')

    log.start('call-1', 'a.ts', cwd)
    write('a.ts', 'changed\n')
    log.end('t1', 'call-1')

    log.start('call-2', 'a.ts', cwd)
    write('a.ts', 'original\n')
    log.end('t1', 'call-2')

    expect(log.changes('t1')).toEqual([])
  })

  it('keeps one thread\'s files out of another\'s', () => {
    const log = new ChangeLog()
    write('a.ts', 'a')
    write('b.ts', 'b')

    log.start('c1', 'a.ts', cwd)
    write('a.ts', 'a2')
    log.end('t1', 'c1')

    log.start('c2', 'b.ts', cwd)
    write('b.ts', 'b2')
    log.end('t2', 'c2')

    expect(log.changes('t1').map((change) => change.path)).toEqual([join(cwd, 'a.ts')])
    expect(log.changes('t2').map((change) => change.path)).toEqual([join(cwd, 'b.ts')])
  })

  it('forgets a thread whose column has gone', () => {
    const log = new ChangeLog()
    write('a.ts', 'a')
    log.start('c1', 'a.ts', cwd)
    write('a.ts', 'a2')
    log.end('t1', 'c1')

    log.forget('t1')
    expect(log.changes('t1')).toEqual([])
  })
})

describe('which tools are watched', () => {
  it('watches the two that name the file they change', () => {
    expect(CHANGING_TOOLS.has('edit')).toBe(true)
    expect(CHANGING_TOOLS.has('write')).toBe(true)
  })

  it('leaves bash alone, because it does not say what it touched', () => {
    expect(CHANGING_TOOLS.has('bash')).toBe(false)
    expect(CHANGING_TOOLS.has('read')).toBe(false)
  })
})
