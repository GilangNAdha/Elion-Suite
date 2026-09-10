import { describe, expect, it } from 'vitest'
import {
  harmonize,
  contrastRatio,
  autoFixContrast,
  deriveTheme,
  relativeLuminance,
  hslToRgb
} from '../src/tokens/theme'
import type { AuroraTheme } from '../src/lib/types'

const baseTheme: AuroraTheme = {
  id: 't',
  name: 'Test',
  seed: { h: 228, s: 68, l: 60 },
  harmony: 'complementary',
  mode: 'dark',
  density: 'comfortable',
  radius: 12,
  glass: 35
}

describe('theming engine (§5)', () => {
  it('derives harmony hues', () => {
    expect(harmonize(0, 'complementary')).toEqual([0, 180])
    expect(harmonize(10, 'analogous')).toEqual([340, 10, 40])
    expect(harmonize(0, 'triadic')).toEqual([0, 120, 240])
    expect(harmonize(0, 'split-complementary')).toEqual([0, 150, 210])
    expect(harmonize(50, 'monochromatic')).toEqual([50])
  })

  it('computes WCAG contrast (white/black ≈ 21)', () => {
    const r = contrastRatio({ h: 0, s: 0, l: 100 }, { h: 0, s: 0, l: 0 })
    expect(r).toBeGreaterThan(20.5)
    expect(r).toBeLessThan(21.1)
  })

  it('auto-corrects text until AA is met', () => {
    const bg = { h: 228, s: 14, l: 11 }
    const fg = { h: 228, s: 10, l: 30 } // too close to bg
    const fixed = autoFixContrast(fg, bg, 4.5)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('resolves a full token set and passes all contrast pairs', () => {
    const resolved = deriveTheme(baseTheme)
    expect(resolved.vars['--primary']).toBeTruthy()
    expect(resolved.vars['--bg']).toBeTruthy()
    expect(resolved.chart).toHaveLength(6)
    for (const p of resolved.pairs) {
      expect(p.pass, `${p.label}: ${p.ratio} < ${p.required}`).toBe(true)
    }
  })

  it('light mode also passes contrast after auto-correction', () => {
    const resolved = deriveTheme({ ...baseTheme, mode: 'light' })
    for (const p of resolved.pairs) {
      expect(p.pass).toBe(true)
    }
  })

  it('luminance sanity: white > black', () => {
    expect(relativeLuminance(hslToRgb(0, 0, 100))).toBeGreaterThan(relativeLuminance(hslToRgb(0, 0, 0)))
  })
})

import { DEFAULT_THEME, BUILT_IN_PRESETS, isValidTheme, useThemeStore } from '../src/stores/themeStore'
import { ELION_PALETTE, IOS_PALETTE } from '../src/tokens/theme'

describe('Elion iOS visual contract', () => {
  it('resolves the light system palette for the shipped default', () => {
    const { vars } = deriveTheme(DEFAULT_THEME)
    expect(vars['--bg']).toBe(IOS_PALETTE.light.void)
    expect(vars['--surface']).toBe(IOS_PALETTE.light.depth)
    expect(vars['--line']).toBe(IOS_PALETTE.light.hairline)
    expect(vars['--ink-muted']).toBe(IOS_PALETTE.light.fog)
    expect(vars['--ink']).toBe(IOS_PALETTE.light.paper)
    expect(vars['--current']).toBe(IOS_PALETTE.light.current)
    expect(vars['--tint']).toBe(IOS_PALETTE.light.tint)
    expect(vars['--dusk']).toBe(IOS_PALETTE.light.dusk)
    expect(vars['--ember']).toBe(IOS_PALETTE.light.ember)
    expect(vars['--on-primary']).toBe('#FFFFFF')
    expect(vars['--radius']).toBe('12px')
    expect(vars['--radius-sm']).toBe('6px')
    expect(vars['--radius-lg']).toBe('16px')
    // iOS cards are solid: no blur, no glass recipe at the default.
    expect(vars['--surface-glass']).toBe('rgba(255, 255, 255, 1.00)')
    expect(vars['--glass-blur']).toBe('0px')
    expect(vars['--shadow-sunken']).toBe('none')
    for (const semantic of ['ok', 'warn', 'bad', 'info'])
      expect([vars['--current'], vars['--dusk']]).not.toContain(vars[`--${semantic}`])
  })
  it('resolves the dark system palette for iOS dark', () => {
    const { vars } = deriveTheme({ ...DEFAULT_THEME, mode: 'dark' })
    expect(vars['--bg']).toBe(IOS_PALETTE.dark.void)
    expect(vars['--surface']).toBe(IOS_PALETTE.dark.depth)
    expect(vars['--ink']).toBe(IOS_PALETTE.dark.paper)
    expect(vars['--current']).toBe(IOS_PALETTE.dark.current)
    expect(vars['--tint']).toBe(IOS_PALETTE.dark.tint)
    expect(vars['--surface-glass']).toBe('rgba(28, 28, 30, 1.00)')
  })
  it('keeps the legacy Night glass identity reachable via its signature seed', () => {
    const classic = deriveTheme({
      ...DEFAULT_THEME,
      mode: 'dark',
      seed: { h: 168.4, s: 71.4, l: 57.5 },
      glass: 83
    })
    expect(classic.vars['--bg']).toBe(ELION_PALETTE.void)
    expect(classic.vars['--surface']).toBe(ELION_PALETTE.depth)
    expect(classic.vars['--current']).toBe(ELION_PALETTE.current)
    expect(classic.vars['--surface-glass']).toBe('rgba(20, 27, 39, 0.60)')
    expect(classic.vars['--glass-blur']).toBe('20px')
  })
  it.each(BUILT_IN_PRESETS)('passes real contrast including glass and subtle lozenges: $name', (preset) => {
    for (const mode of ['light', 'dark'] as const) {
      for (const glass of [0, 50, 83, 100]) {
        for (const pair of deriveTheme({ ...preset, mode, glass }).pairs) {
          expect(pair.pass, `${preset.name}/${mode}/${glass}: ${pair.label} ${pair.ratio}`).toBe(true)
        }
      }
    }
  })
  it('changes density spacing, not the font-size readability floor', () => {
    const compact = deriveTheme({ ...DEFAULT_THEME, density: 'compact' })
    const spacious = deriveTheme({ ...DEFAULT_THEME, density: 'spacious' })
    expect(compact.baseFont).toBe(spacious.baseFont)
    expect(compact.vars['--density']).not.toBe(spacious.vars['--density'])
  })
  it('keeps custom seed colors live instead of pinning every default-id theme', () => {
    expect(deriveTheme({ ...DEFAULT_THEME, seed: { h: 24, s: 70, l: 55 } }).vars['--current']).not.toBe(
      ELION_PALETTE.current
    )
  })
})

describe('theme import validation', () => {
  it('does not break the UI by importing incomplete tokens', () => {
    const previous = useThemeStore.getState().theme
    expect(useThemeStore.getState().importJSON('{"theme":{"name":"Broken"}}')).toBe(false)
    expect(useThemeStore.getState().theme).toEqual(previous)
  })
  it('accepts complete seeds but rejects out-of-range controls', () => {
    expect(isValidTheme(DEFAULT_THEME)).toBe(true)
    expect(isValidTheme({ ...DEFAULT_THEME, glass: 101 })).toBe(false)
    expect(isValidTheme({ ...DEFAULT_THEME, radius: -1 })).toBe(false)
  })
})
