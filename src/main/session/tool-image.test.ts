import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { imageBody, imageMime, MAX_DRAWN_BYTES } from './tool-image'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'piocarina-image-'))
  await writeFile(join(root, 'shot.png'), PNG)
  await writeFile(join(root, 'notes.md'), '# hi')
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('imageMime', () => {
  it('names the picture formats a repository holds', () => {
    expect(imageMime('a/b/shot.PNG')).toBe('image/png')
    expect(imageMime('x.jpeg')).toBe('image/jpeg')
    expect(imageMime('icon.svg')).toBe('image/svg+xml')
  })

  it('says nothing about anything else', () => {
    expect(imageMime('notes.md')).toBeNull()
    expect(imageMime('Makefile')).toBeNull()
  })
})

describe('a read of an image', () => {
  it('draws the picture', async () => {
    const body = await imageBody('read', { path: 'shot.png' }, root, false)

    expect(body).toEqual({
      type: 'image',
      src: `data:image/png;base64,${PNG.toString('base64')}`,
      alt: 'shot.png',
    })
  })

  it('takes an absolute path too', async () => {
    const body = await imageBody('read', { path: join(root, 'shot.png') }, root, false)
    expect(body?.type).toBe('image')
  })

  it('says the size instead of drawing something enormous', async () => {
    // A data URI is a string in the renderer's heap and in every list holding
    // the block; a huge one inside a virtualized column is a stall.
    await writeFile(join(root, 'big.png'), Buffer.alloc(MAX_DRAWN_BYTES + 1))
    const body = await imageBody('read', { path: 'big.png' }, root, false)

    expect(body?.type).toBe('markdown')
    expect(body?.type === 'markdown' && body.text).toContain('too large')
  })

  it('draws nothing for a file that is not a picture', async () => {
    expect(await imageBody('read', { path: 'notes.md' }, root, false)).toBeNull()
  })

  it('draws nothing for a call that failed', async () => {
    // Inventing an image for a read that did not happen is worse than a plain
    // row.
    expect(await imageBody('read', { path: 'shot.png' }, root, true)).toBeNull()
  })

  it('draws nothing for a tool that was not a read', async () => {
    expect(await imageBody('bash', { path: 'shot.png' }, root, false)).toBeNull()
  })

  it('refuses a path outside the workspace', async () => {
    expect(await imageBody('read', { path: '../elsewhere.png' }, root, false)).toBeNull()
    expect(await imageBody('read', { path: '/etc/shot.png' }, root, false)).toBeNull()
  })

  it('draws nothing when the file has gone', async () => {
    expect(await imageBody('read', { path: 'missing.png' }, root, false)).toBeNull()
  })

  it('draws nothing when there was no path at all', async () => {
    expect(await imageBody('read', {}, root, false)).toBeNull()
    expect(await imageBody('read', undefined, root, false)).toBeNull()
  })
})
