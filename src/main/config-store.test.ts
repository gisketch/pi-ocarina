import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigStore, configPath } from './config-store'

async function fileWith(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-config-'))
  const file = join(dir, 'config.json')
  await writeFile(file, text, 'utf8')
  return file
}

describe('reading the configuration file', () => {
  it('is silent about a file that does not exist', async () => {
    // Most readers never write one. Reporting its absence reports the default.
    const store = new ConfigStore(join(tmpdir(), 'piocarina-nothing-here', 'config.json'))
    await store.load()

    expect(store.problems).toEqual([])
    expect(store.config.keys).toEqual([])
  })

  it('reads what is there', async () => {
    const store = new ConfigStore(
      await fileWith('{"hooks":[{"on":"turn.end","command":"pnpm test"}]}'),
    )
    await store.load()

    expect(store.config.hooks).toEqual([{ on: 'turn.end', command: 'pnpm test' }])
    expect(store.problems).toEqual([])
  })

  it('keeps the good half of a file with one bad entry', async () => {
    const store = new ConfigStore(
      await fileWith(
        '{"keys":[{"mode":"NORMAL","key":"x","action":"a"},{"mode":"NOPE","key":"y","action":"b"}]}',
      ),
    )
    await store.load()

    expect(store.config.keys).toHaveLength(1)
    expect(store.problems).toHaveLength(1)
  })

  it('starts on defaults when the file is not JSON', async () => {
    const store = new ConfigStore(await fileWith('{oops'))
    await store.load()

    expect(store.config.keys).toEqual([])
    expect(store.problems[0].where).toBe('file')
  })
})

describe('where the file lives', () => {
  it('is under the reader’s home, not the app’s data folder', () => {
    // The app writes its own state to userData. This file is the reader's, and
    // a file the app rewrites is a file a hand-edit can be lost from.
    expect(configPath('/home/me')).toBe('/home/me/.piocarina/config.json')
  })
})
