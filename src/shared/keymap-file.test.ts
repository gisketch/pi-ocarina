import { describe, expect, it } from 'vitest'
import { parseKeymapFile, serializeKeymapFile } from './keymap-file'

describe('parsing keymap.json', () => {
  it('reads action → press pairs', () => {
    const { keys, problems } = parseKeymapFile('{"version":1,"keys":{"thread.next":";"}}')
    expect(keys).toEqual({ 'thread.next': ';' })
    expect(problems).toEqual([])
  })

  it('names bad JSON as one problem and keeps the defaults', () => {
    const { keys, problems } = parseKeymapFile('{nope')
    expect(keys).toEqual({})
    expect(problems).toHaveLength(1)
  })

  it('refuses a shape that is not an object of strings, entry by entry', () => {
    const { keys, problems } = parseKeymapFile(
      '{"keys":{"thread.next":";","block.down":7,"block.up":""}}',
    )
    expect(keys).toEqual({ 'thread.next': ';' })
    expect(problems).toHaveLength(2)
  })

  it('refuses Escape — the one key that must always work', () => {
    const { keys, problems } = parseKeymapFile('{"keys":{"thread.next":"Escape"}}')
    expect(keys).toEqual({})
    expect(problems[0].message).toContain('Escape')
  })

  it('treats a missing keys field as an empty keymap', () => {
    expect(parseKeymapFile('{"version":1}')).toEqual({ keys: {}, problems: [] })
  })
})

describe('writing keymap.json', () => {
  it('round-trips through the parser', () => {
    const keys = { 'thread.next': ';', 'scroll.down': 'C-j' }
    expect(parseKeymapFile(serializeKeymapFile(keys)).keys).toEqual(keys)
  })
})
