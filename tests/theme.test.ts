import { describe, expect, it } from 'vitest'
import { harmonize, contrastRatio, autoFixContrast, deriveTheme, relativeLuminance, hslToRgb } from '../src/tokens/theme'
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
    expect(relativeLuminance(hslToRgb(0, 0, 100))).toBeGreaterThan(
      relativeLuminance(hslToRgb(0, 0, 0))
    )
  })
})
