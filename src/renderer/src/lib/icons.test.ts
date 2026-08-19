import { describe, expect, it } from 'vitest'
import { fileIcon, ICONS, iconSvg, isIcon, toolIcon, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

describe('the icon registry', () => {
  it('resolves every name to an SVG', () => {
    for (const name of names) {
      expect(iconSvg(name).startsWith('<svg')).toBe(true)
    }
  })

  it('never carries a colour of its own', () => {
    // A pack that shipped a hard-coded fill would put one icon in a colour no
    // theme chose, and nobody would notice until a light theme. The brand
    // marks name no fill at all — `Icon.svelte` sets `currentColor` for both
    // packs — so what matters is that none of them names one.
    for (const name of names) {
      expect(/fill="#|stroke="#|fill="rgb|stroke="rgb/.test(iconSvg(name))).toBe(false)
    }
  })

  it('knows a name it does not have', () => {
    expect(isIcon('chevron-right')).toBe(true)
    expect(isIcon('definitely-not-an-icon')).toBe(false)
  })
})

describe('the mark a row wears', () => {
  it('gives a language server its language', () => {
    expect(toolIcon('lsp', 'ts')).toBe('lang-ts')
    expect(toolIcon('lsp', 'csharp')).toBe('lang-csharp')
    expect(toolIcon('lsp', 'python')).toBe('lang-python')
  })

  it('maps a dialect onto its language', () => {
    expect(toolIcon('lsp', 'tsx')).toBe(toolIcon('lsp', 'ts'))
    expect(toolIcon('lsp', 'jsx')).toBe(toolIcon('lsp', 'js'))
  })

  it('falls back to the tool when the language has no mark', () => {
    expect(toolIcon('lsp', '')).toBe('tool-lsp')
    expect(toolIcon('lsp', 'cobol')).toBe('tool-lsp')
  })

  it('leaves every other kind alone, language or not', () => {
    expect(toolIcon('read', 'ts')).toBe('tool-read')
    expect(toolIcon('bash', 'ts')).toBe('tool-bash')
  })

  it('names an icon for a tool it has never heard of', () => {
    expect(toolIcon('whatever')).toBe('tool-raw')
  })
})

describe('the mark beside a path', () => {
  it('wears the language when the file has one', () => {
    expect(fileIcon('src/lib/thing.ts')).toBe('lang-ts')
    expect(fileIcon('App.svelte')).toBe('lang-svelte')
    expect(fileIcon('a/b/main.py')).toBe('lang-python')
  })

  it('is the one answer every chip gives — picker, composer, sent message', () => {
    // The reported bug: chips guessed image-or-generic while the picker knew
    // better. `CLAUDE.md` wears the markdown mark everywhere or nowhere.
    expect(fileIcon('CLAUDE.md')).toBe('lang-markdown')
    expect(fileIcon('pasted-1.png')).toBe('image')
  })

  it('knows the kinds that are not a language', () => {
    expect(fileIcon('docs/shot.png')).toBe('image')
    expect(fileIcon('notes.txt')).toBe('file-text')
    expect(fileIcon('paper.pdf')).toBe('file-pdf')
    expect(fileIcon('build.tar.gz')).toBe('file-zip')
    expect(fileIcon('scripts/check.sh')).toBe('tool-bash')
  })

  it('reads a whole name that says more than its extension', () => {
    expect(fileIcon('pnpm-lock.yaml')).toBe('file-lock')
    expect(fileIcon('Dockerfile')).toBe('file-config')
    expect(fileIcon('.gitignore')).toBe('file-config')
  })

  it('falls back to a plain file rather than guessing', () => {
    expect(fileIcon('LICENSE')).toBe('file')
    expect(fileIcon('weird.qqq')).toBe('file')
  })
})
