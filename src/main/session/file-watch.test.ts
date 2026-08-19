import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileWatchService, type FileChangedMessage } from './file-watch'

const dirs: string[] = []
const services: FileWatchService[] = []

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'watch-'))
  dirs.push(dir)
  return dir
}

function serviceOver(dir: string): { service: FileWatchService; heard: FileChangedMessage[] } {
  const heard: FileChangedMessage[] = []
  const service = new FileWatchService({
    emit: (message) => heard.push(message),
    cwdOf: () => dir,
  })
  services.push(service)
  return { service, heard }
}

function until(check: () => boolean, ms = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      if (check()) return resolve()
      if (Date.now() - started > ms) return reject(new Error('watcher never fired'))
      setTimeout(tick, 25)
    }
    tick()
  })
}

afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the file watcher', () => {
  it('reports a write with the fresh mtime', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'v1')
    const { service, heard } = serviceOver(dir)
    service.watch('w1', 'a.txt')

    writeFileSync(join(dir, 'a.txt'), 'v2')

    await until(() => heard.length > 0)
    expect(heard[0]).toMatchObject({ workspaceId: 'w1', path: 'a.txt' })
    expect(heard[0]?.mtimeMs).toBeGreaterThan(0)
  })

  it('reports a deleted file as gone', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'v1')
    const { service, heard } = serviceOver(dir)
    service.watch('w1', 'a.txt')

    unlinkSync(join(dir, 'a.txt'))

    await until(() => heard.some((message) => message.mtimeMs === null))
  })

  it('ignores its neighbours', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'v1')
    writeFileSync(join(dir, 'b.txt'), 'v1')
    const { service, heard } = serviceOver(dir)
    service.watch('w1', 'a.txt')

    writeFileSync(join(dir, 'b.txt'), 'v2')
    writeFileSync(join(dir, 'a.txt'), 'v2')

    await until(() => heard.length > 0)
    expect(heard.every((message) => message.path === 'a.txt')).toBe(true)
  })

  it('is quiet after unwatch', async () => {
    const dir = root()
    writeFileSync(join(dir, 'a.txt'), 'v1')
    const { service, heard } = serviceOver(dir)
    service.watch('w1', 'a.txt')
    service.unwatch('w1', 'a.txt')

    writeFileSync(join(dir, 'a.txt'), 'v2')

    await new Promise((tick) => setTimeout(tick, 200))
    expect(heard).toEqual([])
  })
})
