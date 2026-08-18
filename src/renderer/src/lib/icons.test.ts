import { describe, expect, it } from 'vitest'
import { ICONS, iconSvg, isIcon, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

describe('the icon registry', () => {
  it('resolves every name to an SVG', () => {
    for (const name of names) {
      expect(iconSvg(name).startsWith('<svg')).toBe(true)
    }
  })

  it('draws every icon in the colour of the text around it', () => {
    // A pack that ever ships a hard-coded fill would put one icon in a colour
    // no theme chose, and nobody would notice until a light theme.
    for (const name of names) {
      expect(iconSvg(name)).toContain('currentColor')
      expect(/fill="#|stroke="#/.test(iconSvg(name))).toBe(false)
    }
  })

  it('knows a name it does not have', () => {
    expect(isIcon('chevron-right')).toBe(true)
    expect(isIcon('definitely-not-an-icon')).toBe(false)
  })
})
