import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extensionForMime, MAX_IMAGE_BYTES, StagedImages } from './staged-images'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')

describe('extensionForMime', () => {
  it('names the types a clipboard actually carries', () => {
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('image/webp')).toBe('webp')
  })

  it('reads a type with parameters on it', () => {
    expect(extensionForMime('image/png; charset=binary')).toBe('png')
  })

  it('refuses to guess at anything else', () => {
    // A file named for a type it is not gets opened by the wrong application,
    // and pi is handed a mime it cannot read.
    expect(extensionForMime('application/pdf')).toBeNull()
    expect(extensionForMime('text/plain')).toBeNull()
    expect(extensionForMime('')).toBeNull()
  })
})

describe('staging a pasted image', () => {
  it('writes the bytes and describes the file', async () => {
    const staged = new StagedImages()
    const attachment = await staged.stage(PNG, 'image/png')

    expect(attachment).not.toBeNull()
    expect(attachment!.name).toBe('pasted-1.png')
    expect(attachment!.mime).toBe('image/png')
    expect(await readFile(attachment!.path)).toEqual(Buffer.from(PNG, 'base64'))

    await staged.cleanup()
  })

  it('numbers them, so two screenshots are two files', async () => {
    const staged = new StagedImages()
    const first = await staged.stage(PNG, 'image/png')
    const second = await staged.stage(PNG, 'image/jpeg')

    expect(first!.name).toBe('pasted-1.png')
    expect(second!.name).toBe('pasted-2.jpg')
    expect(first!.path).not.toBe(second!.path)

    await staged.cleanup()
  })

  it('refuses a type it cannot name', async () => {
    const staged = new StagedImages()
    expect(await staged.stage(PNG, 'application/zip')).toBeNull()
  })

  it('refuses an empty paste', async () => {
    const staged = new StagedImages()
    expect(await staged.stage('', 'image/png')).toBeNull()
  })

  it('refuses something far too big to be a screenshot', async () => {
    const staged = new StagedImages()
    const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')

    expect(await staged.stage(huge, 'image/png')).toBeNull()
  })

  it('removes its directory, so screenshots do not pile up per session', async () => {
    const staged = new StagedImages()
    const attachment = await staged.stage(PNG, 'image/png')

    await staged.cleanup()

    await expect(readFile(attachment!.path)).rejects.toThrow()
  })

  it('is safe to clean up twice', async () => {
    const staged = new StagedImages()
    await staged.stage(PNG, 'image/png')
    await staged.cleanup()
    await expect(staged.cleanup()).resolves.toBeUndefined()
  })
})

describe('two images pasted at once', () => {
  it('shares one directory rather than orphaning the first', async () => {
    // `#dir ??= await mkdtemp(...)` reads as one step and is two: both callers
    // see null, both create a directory, and the second assignment orphans the
    // first — a leaked folder nobody would think to look for.
    const staged = new StagedImages()

    const [a, b] = await Promise.all([
      staged.stage(PNG, 'image/png'),
      staged.stage(PNG, 'image/png'),
    ])

    const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))
    expect(dirOf(a!.path)).toBe(dirOf(b!.path))
    expect(a!.name).not.toBe(b!.name)

    await staged.cleanup()
    await expect(readFile(a!.path)).rejects.toThrow()
    await expect(readFile(b!.path)).rejects.toThrow()
  })
})

describe('what this app vouches for', () => {
  it('owns nothing before it has staged anything', () => {
    expect(new StagedImages().owns('/tmp/anything.png')).toBe(false)
  })

  it('owns the files it wrote, and nothing beside them', async () => {
    const staged = new StagedImages()
    const attachment = await staged.stage(PNG, 'image/png')
    expect(attachment).not.toBeNull()

    expect(staged.owns(attachment?.path ?? '')).toBe(true)
    // A sibling directory whose name merely starts the same way is not ours.
    expect(staged.owns(`${dirname(attachment?.path ?? '')}-else/x.png`)).toBe(false)
    expect(staged.owns('/etc/passwd')).toBe(false)

    await staged.cleanup()
  })

  it('stops vouching once the directory is gone', async () => {
    const staged = new StagedImages()
    const attachment = await staged.stage(PNG, 'image/png')
    await staged.cleanup()

    expect(staged.owns(attachment?.path ?? '')).toBe(false)
  })
})
