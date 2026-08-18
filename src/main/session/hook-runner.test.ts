import { describe, expect, it } from 'vitest'
import { argsOf, hookFailed, hookSummary, MAX_HOOK_OUTPUT, runHook } from './hook-runner'

const cwd = process.cwd()

describe('splitting a command', () => {
  it('splits on whitespace', () => {
    expect(argsOf('pnpm test --run')).toEqual(['pnpm', 'test', '--run'])
  })

  it('honours quotes, so a path with a space works', () => {
    expect(argsOf('echo "two words" \'and more\'')).toEqual(['echo', 'two words', 'and more'])
  })

  it('interprets nothing else', () => {
    // No shell. `|` and `>` are arguments, not plumbing: handing a string from
    // a file to `sh -c` makes every hook a place a stray quote runs something
    // nobody wrote.
    expect(argsOf('echo hi | rm -rf /')).toEqual(['echo', 'hi', '|', 'rm', '-rf', '/'])
  })

  it('reads an empty command as nothing', () => {
    expect(argsOf('   ')).toEqual([])
  })
})

describe('running one', () => {
  it('reports a success with its output', async () => {
    const result = await runHook({ on: 'turn.end', command: 'echo hello' }, { cwd })

    expect(result.code).toBe(0)
    expect(result.output.trim()).toBe('hello')
    expect(hookFailed(result)).toBe(false)
    expect(hookSummary(result)).toBe('ok')
  })

  it('reports a non-zero exit without throwing', async () => {
    const result = await runHook({ on: 'turn.end', command: 'sh -c "exit 3"' }, { cwd })

    expect(result.code).toBe(3)
    expect(hookFailed(result)).toBe(true)
    expect(hookSummary(result)).toBe('exit 3')
  })

  it('reports a binary that does not exist', async () => {
    const result = await runHook(
      { on: 'turn.end', command: 'piocarina-no-such-binary-anywhere' },
      { cwd },
    )

    expect(result.failedToStart).toBe(true)
    expect(hookSummary(result)).toBe('could not run')
  })

  it('reports an empty command rather than spawning nothing', async () => {
    const result = await runHook({ on: 'turn.end', command: '  ' }, { cwd })
    expect(result.failedToStart).toBe(true)
  })

  it('kills a hook that runs too long, and says so', async () => {
    const result = await runHook(
      { on: 'turn.end', command: 'sleep 30', timeoutMs: 120 },
      { cwd },
    )

    expect(result.timedOut).toBe(true)
    expect(hookSummary(result)).toBe('timed out')
    expect(hookFailed(result)).toBe(true)
  })

  it('bounds what it keeps of a very talkative hook', async () => {
    const result = await runHook(
      { on: 'turn.end', command: `sh -c "yes piocarina | head -c ${MAX_HOOK_OUTPUT * 3}"` },
      { cwd },
    )

    // A row is read, not archived.
    expect(result.output.length).toBeLessThanOrEqual(MAX_HOOK_OUTPUT)
  })
})
