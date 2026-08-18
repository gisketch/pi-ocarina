import { describe, expect, it } from 'vitest'
import {
  MODE_BOUNDARY,
  modeChip,
  modePrompt,
  parseModes,
  resolveMode,
  SHIPPED_MODES,
  type ChatMode,
} from './chat-modes'

const MODES: ChatMode[] = [
  { id: 'terse', name: 'terse', instructions: 'be brief' },
  { id: 'plain', name: 'plain', instructions: 'be plain' },
]

describe('which voice is in force', () => {
  it('prefers the thread over the default', () => {
    expect(resolveMode('plain', 'terse', MODES)?.id).toBe('plain')
  })

  it('falls back to the default when the thread has no opinion', () => {
    expect(resolveMode(undefined, 'terse', MODES)?.id).toBe('terse')
  })

  it('is none when neither is set', () => {
    expect(resolveMode(undefined, undefined, MODES)).toBeUndefined()
  })

  it('is none when the name matches no mode', () => {
    // A deleted mode leaves a dangling pointer sooner or later. Silence is the
    // right answer to it — never a crash, and never a stranger's voice.
    expect(resolveMode('deleted', 'terse', MODES)).toBeUndefined()
    expect(resolveMode(undefined, 'deleted', MODES)).toBeUndefined()
  })

  it('treats an empty name as no opinion rather than as a lookup', () => {
    expect(resolveMode('', undefined, MODES)).toBeUndefined()
  })
})

describe('what a mode puts in the system prompt', () => {
  it('is the reader’s prose, then the boundary the app adds', () => {
    expect(modePrompt(MODES[0])).toEqual(['be brief', MODE_BOUNDARY])
  })

  it('is nothing at all when no mode is set', () => {
    // "Normal" is the absence of a mode. A `normal` mode carrying prose would
    // be a positive instruction pushing the model away from stock.
    expect(modePrompt(undefined)).toEqual([])
  })

  it('is nothing when the prose is empty, so the boundary never stands alone', () => {
    expect(modePrompt({ id: 'x', name: 'x', instructions: '   ' })).toEqual([])
  })

  it('says the mode cannot change what the agent does', () => {
    expect(MODE_BOUNDARY).toContain('not what you do')
    expect(MODE_BOUNDARY).toContain('keep the work complete')
  })
})

describe('the chip', () => {
  it('names the mode, and says nothing when there is none', () => {
    expect(modeChip(MODES[0])).toBe('terse')
    expect(modeChip(undefined)).toBeNull()
  })
})

describe('the shipped mode', () => {
  it('is one, and constrains sentences rather than work', () => {
    expect(SHIPPED_MODES).toHaveLength(1)
    expect(SHIPPED_MODES[0].id).toBe('terse')
    // The boundary is defence in depth; the shipped prose is written to it too.
    expect(SHIPPED_MODES[0].instructions).toContain('Keep every technical fact')
  })
})

describe('reading a stored list', () => {
  it('drops entries that are not modes, and keeps their neighbours', () => {
    const read = parseModes([
      { id: 'a', name: 'a', instructions: 'x' },
      { id: '', name: 'b', instructions: 'x' },
      { id: 'c', name: '', instructions: 'x' },
      { id: 'd', name: 'd' },
      'nonsense',
      null,
      { id: 'e', name: 'e', instructions: '' },
    ])
    expect(read.map((one) => one.id)).toEqual(['a', 'e'])
  })

  it('reads a non-array as nothing stored', () => {
    expect(parseModes(undefined)).toEqual([])
    expect(parseModes({ terse: true })).toEqual([])
  })

  it('keeps only the three fields, so a stored extra cannot ride along', () => {
    const read = parseModes([{ id: 'a', name: 'a', instructions: 'x', tools: ['bash'] }])
    expect(read[0]).toEqual({ id: 'a', name: 'a', instructions: 'x' })
  })
})
