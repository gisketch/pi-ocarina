import { describe, expect, it } from 'vitest'
import { imageSize } from './image-size'

/** The smallest real files of each format, as bytes. Hand-built rather than
 *  fixtures on disk: the header is the whole subject, and a test that reads a
 *  file is testing the reading. */
function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(0x89504e47, 0)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function gif(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(10)
  bytes.write('GIF89a', 0, 'ascii')
  bytes.writeUInt16LE(width, 6)
  bytes.writeUInt16LE(height, 8)
  return bytes
}

function jpeg(width: number, height: number): Buffer {
  // SOI, one APP0 segment to walk past, then SOF0.
  const app0 = Buffer.alloc(6)
  app0.writeUInt16BE(0xffe0, 0)
  app0.writeUInt16BE(4, 2)

  const sof = Buffer.alloc(11)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(8, 2)
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

describe('reading a size from a header', () => {
  it('reads a PNG', () => {
    expect(imageSize(png(1078, 822))).toEqual({ width: 1078, height: 822 })
  })

  it('reads a GIF', () => {
    expect(imageSize(gif(64, 48))).toEqual({ width: 64, height: 48 })
  })

  it('reads a JPEG past the segments before its frame header', () => {
    expect(imageSize(jpeg(1440, 900))).toEqual({ width: 1440, height: 900 })
  })

  it('reads a lossless WebP, whose sizes are stored one short', () => {
    const bytes = Buffer.alloc(25)
    bytes.write('RIFF', 0, 'ascii')
    bytes.write('WEBP', 8, 'ascii')
    bytes.write('VP8L', 12, 'ascii')
    // width-1 in the low 14 bits, height-1 in the next 14.
    bytes.writeUInt32LE((99 & 0x3fff) | ((49 & 0x3fff) << 14), 21)

    expect(imageSize(bytes)).toEqual({ width: 100, height: 50 })
  })

  it('says nothing rather than guessing at something it cannot read', () => {
    expect(imageSize(Buffer.from('not an image at all'))).toBeNull()
    expect(imageSize(Buffer.alloc(0))).toBeNull()
    // A PNG signature with nothing behind it.
    expect(imageSize(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })

  it('does not walk off the end of a truncated JPEG', () => {
    expect(imageSize(jpeg(10, 10).subarray(0, 9))).toBeNull()
  })
})
