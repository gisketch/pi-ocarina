import { describe, expect, it, vi } from 'vitest'
import { EX_COMMANDS, isForced, type ExBag } from './ex-commands'

function command(name: string) {
  const found = EX_COMMANDS.find((one) => one.name === name)
  if (!found) throw new Error(`no such ex command: ${name}`)
  return found
}

function bag(saved = true): ExBag & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    save: vi.fn((force: boolean) => {
      calls.push(`save:${force}`)
      return Promise.resolve(saved)
    }),
    quit: vi.fn((force: boolean) => {
      calls.push(`quit:${force}`)
    }),
    quitAll: vi.fn((force: boolean) => {
      calls.push(`quitAll:${force}`)
    }),
  }
}

describe('isForced', () => {
  it('reads the bang the dispatcher leaves at the head of argString', () => {
    expect(isForced('!')).toBe(true)
    expect(isForced('  !')).toBe(true)
    expect(isForced('')).toBe(false)
    expect(isForced(undefined)).toBe(false)
    // An argument is not a bang.
    expect(isForced(' something')).toBe(false)
  })
})

describe('the : commands', () => {
  it(':w saves without force, :w! with it', async () => {
    const plain = bag()
    await command('write').run(plain, false)
    expect(plain.calls).toEqual(['save:false'])

    const forced = bag()
    await command('write').run(forced, true)
    expect(forced.calls).toEqual(['save:true'])
  })

  it(':q quits, :q! forces the quit', async () => {
    const plain = bag()
    await command('quit').run(plain, false)
    expect(plain.calls).toEqual(['quit:false'])

    const forced = bag()
    await command('quit').run(forced, true)
    expect(forced.calls).toEqual(['quit:true'])
  })

  it(':wq saves first and quits only when the save landed', async () => {
    const happy = bag(true)
    await command('wq').run(happy, false)
    // The quit is unconditional once written — the buffer is clean by then.
    expect(happy.calls).toEqual(['save:false', 'quit:true'])
  })

  it(':wq leaves the column open when the write refused', async () => {
    const stale = bag(false)
    await command('wq').run(stale, false)
    expect(stale.calls).toEqual(['save:false'])
  })

  it(':qa closes every buffer column, force carried through', async () => {
    const all = bag()
    await command('qall').run(all, true)
    expect(all.calls).toEqual(['quitAll:true'])
  })

  it('registers the short names vim hands people type', () => {
    expect(command('write').prefix).toBe('w')
    expect(command('quit').prefix).toBe('q')
    expect(command('qall').prefix).toBe('qa')
  })
})
