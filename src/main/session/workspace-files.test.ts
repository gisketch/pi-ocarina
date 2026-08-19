import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  STALE_WRITE,
  readWorkspaceFile,
  resolveInside,
  statWorkspaceFile,
  writeWorkspaceFile,
} from './workspace-files'

const dirs: string[] = []

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wsfiles-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resolveInside', () => {
  it('refuses a path that climbs out of the root', () => {
    expect(() => resolveInside('/tmp/ws', '../elsewhere')).toThrow('escapes the workspace')
  })

  it('refuses an absolute path outright', () => {
    expect(() => resolveInside('/tmp/ws', '/etc/passwd')).toThrow('workspace-relative')
  })

  it('refuses a sibling whose name merely starts with the root', () => {
    expect(() => resolveInside('/tmp/ws', '../ws-evil/file')).toThrow('escapes the workspace')
  })
})

describe('read, stat, write', () => {
  it('round-trips a file with its mtime', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'hello')

    const read = await readWorkspaceFile(dir, 'a.txt')
    expect(read).toMatchObject({ text: 'hello' })
    if ('missing' in read) throw new Error('unexpected missing')

    const info = await statWorkspaceFile(dir, 'a.txt')
    expect(info).toEqual({ mtimeMs: read.mtimeMs })
  })

  it('answers missing rather than throwing on a file that is not there', async () => {
    const dir = root()
    expect(await readWorkspaceFile(dir, 'ghost.txt')).toEqual({ missing: true })
    expect(await statWorkspaceFile(dir, 'ghost.txt')).toEqual({ missing: true })
  })

  it('writes when the mtime still matches, and returns the new one', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'old')
    const before = await statWorkspaceFile(dir, 'a.txt')
    if ('missing' in before) throw new Error('unexpected missing')

    const after = await writeWorkspaceFile(dir, 'a.txt', 'new', before.mtimeMs)

    expect((await readWorkspaceFile(dir, 'a.txt')) as { text: string }).toMatchObject({
      text: 'new',
    })
    expect(after.mtimeMs).toBeGreaterThanOrEqual(before.mtimeMs)
  })

  it('refuses a stale write with the exact message the editor shows', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'v1')
    const loaded = await statWorkspaceFile(dir, 'a.txt')
    if ('missing' in loaded) throw new Error('unexpected missing')

    // Someone else — pi — writes after the buffer loaded.
    utimesSync(join(dir, 'a.txt'), new Date(), new Date(Date.now() + 5000))

    await expect(writeWorkspaceFile(dir, 'a.txt', 'mine', loaded.mtimeMs)).rejects.toThrow(
      STALE_WRITE,
    )
    expect((await readWorkspaceFile(dir, 'a.txt')) as { text: string }).toMatchObject({
      text: 'v1',
    })
  })

  it('forces past staleness when expectMtimeMs is null', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'theirs')

    await writeWorkspaceFile(dir, 'a.txt', 'mine', null)

    expect((await readWorkspaceFile(dir, 'a.txt')) as { text: string }).toMatchObject({
      text: 'mine',
    })
  })

  it('recreates a deleted file rather than refusing the write', async () => {
    const dir = root()
    // The buffer loaded the file, then it vanished. `:w` puts it back —
    // vim's own contract, and the reader asked for their bytes to land.
    const written = await writeWorkspaceFile(dir, 'gone.txt', 'back', 123)
    expect(written.mtimeMs).toBeGreaterThan(0)
  })
})
