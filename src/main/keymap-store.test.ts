import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KeymapStore } from './keymap-store'

async function dirWith(text?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-keymap-'))
  if (text !== undefined) await writeFile(join(dir, 'keymap.json'), text, 'utf8')
  return dir
}

describe('loading', () => {
  it('is silent about a file that does not exist — nobody has rebound anything', async () => {
    const store = new KeymapStore(join(await dirWith(), 'keymap.json'))
    await store.load()

    expect(store.keys).toEqual({})
    expect(store.problems).toEqual([])
  })

  it('reads what the screen saved last time', async () => {
    const dir = await dirWith('{"version":1,"keys":{"thread.next":";"}}')
    const store = new KeymapStore(join(dir, 'keymap.json'))
    await store.load()

    expect(store.keys).toEqual({ 'thread.next': ';' })
  })

  it('keeps the good entries of a damaged file, and says what was dropped', async () => {
    const dir = await dirWith('{"keys":{"thread.next":";","block.down":3}}')
    const store = new KeymapStore(join(dir, 'keymap.json'))
    await store.load()

    expect(store.keys).toEqual({ 'thread.next': ';' })
    expect(store.problems).toHaveLength(1)
  })
})

describe('saving', () => {
  it('writes the whole file and reads back the same', async () => {
    const dir = await dirWith()
    const store = new KeymapStore(join(dir, 'keymap.json'))

    await store.save({ 'thread.next': ';' })

    expect(store.keys).toEqual({ 'thread.next': ';' })
    const onDisk = JSON.parse(await readFile(join(dir, 'keymap.json'), 'utf8'))
    expect(onDisk.keys).toEqual({ 'thread.next': ';' })
  })

  it('an empty save empties the file — that is what reset all means', async () => {
    const dir = await dirWith('{"keys":{"thread.next":";"}}')
    const store = new KeymapStore(join(dir, 'keymap.json'))
    await store.load()

    await store.save({})

    const onDisk = JSON.parse(await readFile(join(dir, 'keymap.json'), 'utf8'))
    expect(onDisk.keys).toEqual({})
  })
})
