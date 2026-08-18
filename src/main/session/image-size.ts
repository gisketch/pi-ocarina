/** An image's dimensions, read from its header.
 *
 *  Headers only — never a decode. The row says `image · 1078×822` and that is
 *  the whole requirement; decoding a picture to count its pixels would spend
 *  real work on a caption. Anything this cannot read returns null and the row
 *  simply says `image`, which is still true. */

export interface Size {
  width: number
  height: number
}

export function imageSize(bytes: Buffer): Size | null {
  return png(bytes) ?? gif(bytes) ?? webp(bytes) ?? jpeg(bytes)
}

function png(bytes: Buffer): Size | null {
  // 8-byte signature, then an IHDR chunk whose width and height are the first
  // two big-endian words of its data.
  if (bytes.length < 24) return null
  if (bytes.readUInt32BE(0) !== 0x89504e47) return null
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function gif(bytes: Buffer): Size | null {
  if (bytes.length < 10) return null
  if (bytes.toString('ascii', 0, 3) !== 'GIF') return null
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
}

function webp(bytes: Buffer): Size | null {
  // 16 is enough to know it is a WebP and which kind; each branch below
  // states its own reach. A lossless file's header ends at 25.
  if (bytes.length < 16) return null
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') return null
  if (bytes.toString('ascii', 8, 12) !== 'WEBP') return null

  const kind = bytes.toString('ascii', 12, 16)
  // Lossy: a VP8 keyframe's 14-byte frame header ends with two 14-bit sizes.
  if (kind === 'VP8 ' && bytes.length >= 30) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }
  // Lossless: two packed 14-bit sizes, each one less than the real dimension.
  if (kind === 'VP8L' && bytes.length >= 25) {
    const packed = bytes.readUInt32LE(21)
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 }
  }
  // Extended: a 24-bit canvas size, also one less than the real dimension.
  if (kind === 'VP8X' && bytes.length >= 30) {
    const at = 24
    return {
      width: (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + 1,
      height: (bytes[at + 3] | (bytes[at + 4] << 8) | (bytes[at + 5] << 16)) + 1,
    }
  }
  return null
}

function jpeg(bytes: Buffer): Size | null {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return null

  // Walk the segment chain to the start-of-frame, which is the only marker
  // that states the size. Every other segment states its own length, so this
  // is a walk rather than a search — a scan for the marker bytes would find
  // them inside compressed data.
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null
    // A marker may be padded with any number of 0xff fill bytes before its
    // code. Real encoders emit them, and refusing meant giving up on files
    // that are perfectly valid.
    let code = at + 1
    while (code < bytes.length && bytes[code] === 0xff) code += 1
    if (code + 3 >= bytes.length) return null
    at = code - 1
    const marker = bytes[code]
    // Standalone markers carry no length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }
    // 0xff00 is a stuffed byte inside entropy-coded data, not a marker; if the
    // walk reaches one the chain is not what this thinks it is.
    if (marker === 0x00) return null
    const length = bytes.readUInt16BE(at + 2)
    // SOF0–SOF15, minus the two that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }
    }
    if (length < 2) return null
    at += 2 + length
  }
  return null
}
