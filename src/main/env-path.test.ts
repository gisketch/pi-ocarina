import { describe, expect, it } from 'vitest'
import { ensurePath, mergePaths, parseShellPath, resolvedPath, toolDirs } from './env-path'

const answer = (path: string): string => `__ocarina_path__${path}`

describe('mergePaths', () => {
  it('keeps the first path in front', () => {
    expect(mergePaths('/a:/b', '/c')).toBe('/a:/b:/c')
  })

  it('drops repeats, keeping the earliest place a directory appeared', () => {
    expect(mergePaths('/a:/b', '/b:/c:/a')).toBe('/a:/b:/c')
  })

  it('ignores empty segments and missing paths', () => {
    expect(mergePaths('/a::', undefined, null, '', '/b')).toBe('/a:/b')
  })
})

describe('parseShellPath', () => {
  it('reads the value after the marker', () => {
    expect(parseShellPath(answer('/usr/bin:/bin'))).toBe('/usr/bin:/bin')
  })

  it('ignores whatever a startup file printed first', () => {
    expect(parseShellPath(`nvm: version 24\n${answer('/usr/bin')}`)).toBe('/usr/bin')
  })

  it('is null when the shell said nothing we can use', () => {
    expect(parseShellPath('')).toBeNull()
    expect(parseShellPath('command not found')).toBeNull()
    expect(parseShellPath(answer('  '))).toBeNull()
  })
})

describe('resolvedPath', () => {
  const home = '/home/reader'

  it('adds what the login shell knows to what the process was handed', async () => {
    const path = await resolvedPath({
      env: { PATH: '/usr/bin:/bin', SHELL: '/bin/zsh' },
      home,
      run: async () => answer('/usr/bin:/home/reader/.dotnet/tools'),
    })

    expect(path.split(':')).toContain('/home/reader/.dotnet/tools')
    // The launcher's own PATH still leads: a wrapper early in it was meant.
    expect(path.startsWith('/usr/bin:/bin')).toBe(true)
  })

  it('adds the known tool directories even when the shell is no help', async () => {
    const path = await resolvedPath({
      env: { PATH: '/usr/bin', SHELL: '/bin/zsh' },
      home,
      run: async () => '',
    })

    for (const dir of toolDirs(home)) expect(path.split(':')).toContain(dir)
  })

  it('never asks a shell on Windows', async () => {
    let asked = false
    const path = await resolvedPath({
      env: { PATH: 'C:\\Windows', SHELL: '/bin/zsh' },
      home,
      platform: 'win32',
      run: async () => {
        asked = true
        return answer('/nope')
      },
    })

    expect(asked).toBe(false)
    expect(path).toContain('C:\\Windows')
  })

  it('works when the process was handed no PATH at all', async () => {
    const path = await resolvedPath({
      env: { SHELL: '/bin/zsh' },
      home,
      run: async () => answer('/usr/bin'),
    })

    expect(path.split(':')).toContain('/usr/bin')
  })

  it('does not ask when there is no shell to ask', async () => {
    let asked = false
    const path = await resolvedPath({
      env: { PATH: '/usr/bin' },
      home,
      run: async () => {
        asked = true
        return answer('/nope')
      },
    })

    expect(asked).toBe(false)
    expect(path.split(':')).toContain('/usr/bin')
  })
})

describe('ensurePath', () => {
  it('asks the shell once, however many callers wait for it', async () => {
    const before = process.env.PATH
    let asked = 0
    const options = {
      env: { PATH: '/usr/bin', SHELL: '/bin/zsh' },
      home: '/home/reader',
      run: async () => {
        asked += 1
        return answer('/home/reader/.dotnet/tools')
      },
    }

    try {
      const [first, second] = await Promise.all([ensurePath(options), ensurePath(options)])
      expect(asked).toBe(1)
      expect(first).toBe(second)
      // The answer is applied, not merely returned: everything that looks for a
      // binary reads `process.env.PATH` and nothing is handed this value.
      expect(process.env.PATH).toBe(first)
    } finally {
      process.env.PATH = before
    }
  })
})
