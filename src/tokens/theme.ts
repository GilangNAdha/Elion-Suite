// §5 — Theming engine: seed color → HSL harmony → semantic tokens → WCAG
// contrast check with auto-correction. Resolves to CSS variables applied
// globally; the Lockdown theme-override is the only consumer allowed to
// deviate per preset.

import type { AuroraTheme, Harmony } from '../lib/types'

// Legacy "Night glass" identity, kept for the opt-in preset and the wallpaper
// scrim text. The shipped default is the iOS-style system palette below.
export const ELION_PALETTE = {
  void: '#0A0E16',
  depth: '#141B27',
  hairline: '#232C3D',
  fog: '#8B93A8',
  paper: '#EDEFF6',
  current: '#45E0C2',
  dusk: '#9C87F7',
  ember: '#F2A65A'
} as const
// iOS system colors: grouped light-gray canvas, solid elevated cards, hairline
// separators and the system blue tint. `current` is the accessibility-safe
// fill (white labels ≥ 4.5:1); `tint` is the brighter raw system blue used
// for icons, links and selections.
export const IOS_PALETTE = {
  light: {
    void: '#F2F2F7',
    depth: '#FFFFFF',
    hairline: '#DFDFE5',
    fog: '#62626A',
    paper: '#1B1B1F',
    current: '#0066D6',
    tint: '#007AFF',
    dusk: '#5E5CE6',
    ember: '#9C5700'
  },
  dark: {
    void: '#000000',
    depth: '#1C1C1E',
    hairline: '#38383A',
    fog: '#98989F',
    paper: '#FFFFFF',
    current: '#0A6CE0',
    tint: '#0A84FF',
    dusk: '#5E5CE6',
    ember: '#FF9F0A'
  }
} as const
export const ELION_SEED = { h: 211, s: 100, l: 50 } as const
export const CLASSIC_SEED = { h: 168.4, s: 71.4, l: 57.5 } as const

const mod = (h: number) => ((h % 360) + 360) % 360

export function harmonize(h: number, mode: Harmony): number[] {
  switch (mode) {
    case 'complementary':
      return [h, mod(h + 180)]
    case 'analogous':
      return [mod(h - 30), h, mod(h + 30)]
    case 'triadic':
      return [h, mod(h + 120), mod(h + 240)]
    case 'split-complementary':
      return [h, mod(h + 150), mod(h + 210)]
    case 'monochromatic':
      return [h]
  }
}

const hsl = (h: number, s: number, l: number, a?: number) =>
  a === undefined
    ? `hsl(${mod(h).toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
    : `hsl(${mod(h).toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`

// --- WCAG contrast math -----------------------------------------------------

interface Hsl {
  h: number
  s: number
  l: number
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = mod(h) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(hslToRgb(a.h, a.s, a.l))
  const lb = relativeLuminance(hslToRgb(b.h, b.s, b.l))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Nudge lightness (toward white or black) until contrast is met or bounds. */
export function autoFixContrast(fg: Hsl, bg: Hsl, required: number): Hsl {
  let { h, s, l } = fg
  let guard = 0
  const towardBg =
    contrastRatio({ h: 0, s: 0, l: 100 }, bg) >= contrastRatio({ h: 0, s: 0, l: 0 }, bg) ? 1 : -1
  while (contrastRatio({ h, s, l }, bg) < required + 0.02 && guard < 200) {
    l = Math.min(100, Math.max(0, l + 1.25 * towardBg))
    guard++
    if (l <= 0 || l >= 100) break
  }
  return { h, s, l }
}

function pickOn(color: Hsl): string {
  const white: Hsl = { h: 0, s: 0, l: 100 }
  const black: Hsl = { h: 0, s: 0, l: 0 }
  return contrastRatio(white, color) >= contrastRatio(black, color) ? hsl(0, 0, 100) : hsl(0, 0, 0)
}

// --- Resolution -------------------------------------------------------------

export interface ContrastPair {
  label: string
  fg: string
  bg: string
  ratio: number
  required: number
  pass: boolean
}

export interface ResolvedTheme {
  vars: Record<string, string>
  pairs: ContrastPair[]
  chart: string[]
  baseFont: string
}

/** Parse theme colors without pretending a hex color is HSL (the old checker
 * silently treated every non-HSL value as middle gray). */
export function colorRgb(value: string): [number, number, number] {
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const full = hex.length === 3 ? [...hex].map((x) => x + x).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const match = value.match(/hsl\(([\d.-]+) ([\d.]+)% ([\d.]+)%/)
  if (match) return hslToRgb(Number(match[1]), Number(match[2]), Number(match[3]))
  const rgb = value.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Unsupported contrast color: ${value}`)
}

export function rgbContrast(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a),
    lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export function composite(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number
): [number, number, number] {
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as [number, number, number]
}
export function rgbToHsl(rgb: [number, number, number]): Hsl {
  const [r, g, b] = rgb.map((v) => v / 255)
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h =
    d === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / d) % 6)
        : max === g
          ? 60 * ((b - r) / d + 2)
          : 60 * ((r - g) / d + 4)
  return { h: mod(h), s: s * 100, l: l * 100 }
}
const cssHsl = (v: Hsl) => hsl(v.h, v.s, v.l)

export function deriveTheme(t: AuroraTheme): ResolvedTheme {
  const { h, s } = t.seed
  const dark = t.mode === 'dark'
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05
  const classicSeed = near(h, CLASSIC_SEED.h) && near(s, CLASSIC_SEED.s) && near(t.seed.l, CLASSIC_SEED.l)
  const iosSeed = near(h, ELION_SEED.h) && near(s, ELION_SEED.s) && near(t.seed.l, ELION_SEED.l)
  // The legacy glass identity only resolves for its own signature dark seed;
  // the iOS system palette is mode-aware (light + dark shipped defaults).
  const classic = dark && classicSeed && !iosSeed
  const pal = iosSeed && !classic ? (dark ? IOS_PALETTE.dark : IOS_PALETTE.light) : null
  const ios = pal !== null
  const isDefault = classic || ios
  const baseHue = mod(h + 55)
  const surface: Hsl = isDefault
    ? rgbToHsl(colorRgb(classic ? ELION_PALETTE.depth : pal!.depth))
    : { h: baseHue, s: dark ? 25 : 24, l: dark ? 11 : 98 }
  const bg: Hsl = isDefault
    ? rgbToHsl(colorRgb(classic ? ELION_PALETTE.void : pal!.void))
    : { h: baseHue, s: dark ? 32 : 24, l: dark ? 6 : 95 }
  const ink = autoFixContrast({ h: baseHue, s: 20, l: dark ? 94 : 15 }, surface, 4.5)
  const muted = autoFixContrast({ h: baseHue, s: 15, l: dark ? 64 : 40 }, surface, 4.5)
  const primary = autoFixContrast(
    { h, s: Math.max(35, Math.min(85, s)), l: dark ? Math.max(50, t.seed.l) : Math.min(42, t.seed.l) },
    surface,
    3
  )
  const harmony = harmonize(h, t.harmony)
  const duskHue = classicSeed || iosSeed ? 251.3 : (harmony.find((v) => v !== h) ?? mod(h + 88))
  // Dusk is never exposed as a stand-alone accent fill. Only --signature uses it.
  const current = classic ? ELION_PALETTE.current : pal ? pal.current : cssHsl(primary)
  const tint = pal ? pal.tint : current
  const dusk = classic ? ELION_PALETTE.dusk : pal ? pal.dusk : hsl(duskHue, 64, dark ? 72 : 46)
  const surfaceColor = classic ? ELION_PALETTE.depth : pal ? pal.depth : cssHsl(surface)
  const bgColor = classic ? ELION_PALETTE.void : pal ? pal.void : cssHsl(bg)
  const inkColor = classic ? ELION_PALETTE.paper : pal ? pal.paper : cssHsl(ink)
  const mutedColor = classic ? ELION_PALETTE.fog : pal ? pal.fog : cssHsl(muted)
  const glassAlpha = 1 - (Math.max(0, Math.min(100, t.glass)) / 100) * 0.48
  const glassRgb = colorRgb(surfaceColor)
  const glassColor = `rgba(${glassRgb.map(Math.round).join(', ')}, ${glassAlpha.toFixed(2)})`
  // The wallpaper scrim caps arbitrary imported media's luminance, not just
  // our dark built-in image. Check the worst case (pure white behind it).
  const scrimRgb = colorRgb(ELION_PALETTE.void)
  const cappedWallpaper = composite(scrimRgb, [255, 255, 255], 0.68)
  const glassWorst = composite(glassRgb, dark ? cappedWallpaper : [0, 0, 0], Number(glassAlpha.toFixed(2)))
  const glassMuted = autoFixContrast(rgbToHsl(colorRgb(mutedColor)), rgbToHsl(glassWorst), 4.5)
  const glassInk = autoFixContrast(rgbToHsl(colorRgb(inkColor)), rgbToHsl(glassWorst), 4.5)

  // These semantic hues deliberately never reuse Current or Dusk. Each one
  // is contrast-corrected for both plain text and the subtle Lozenge fill.
  const semantics: Record<string, string> = {}
  const semanticPairs: ContrastPair[] = []
  const entries = { ok: [104, 40], warn: [43, 70], bad: [350, 65], info: [211, 63] }
  for (const [name, [hh, sat]] of Object.entries(entries)) {
    let tone = autoFixContrast({ h: hh, s: sat, l: dark ? 72 : 34 }, surface, 4.5)
    const fill = composite(hslToRgb(tone.h, tone.s, tone.l), glassRgb, 0.09)
    tone = autoFixContrast(tone, rgbToHsl(fill), 4.5)
    const value = cssHsl(tone)
    semantics[`--${name}`] = value
    semantics[`--on-${name}`] = pickOn(tone)
    semanticPairs.push({
      label: `${name} / subtle lozenge`,
      fg: value,
      bg: `rgb(${fill.join(', ')})`,
      ratio: 0,
      required: 4.5,
      pass: false
    })
  }
  const chart = [h, mod(h + 35), 104, 43, 211, 350].map((hh, i) =>
    cssHsl(autoFixContrast({ h: hh, s: 45 + i * 3, l: dark ? 68 : 40 }, surface, 3))
  )
  const radius = Math.max(0, Math.min(24, t.radius))
  const vars: Record<string, string> = {
    '--void': bgColor,
    '--depth': surfaceColor,
    '--hairline': classic ? ELION_PALETTE.hairline : pal ? pal.hairline : hsl(baseHue, 23, dark ? 21 : 84),
    '--paper': inkColor,
    '--wallpaper-ink': ELION_PALETTE.paper,
    '--fog': mutedColor,
    '--current': current,
    '--tint': tint,
    '--dusk': dusk,
    '--ember': pal
      ? pal.ember
      : classic
        ? ELION_PALETTE.ember
        : cssHsl(autoFixContrast({ h: 30, s: 70, l: dark ? 65 : 37 }, surface, 4.5)),
    '--bg': bgColor,
    '--surface': surfaceColor,
    '--raised': surfaceColor,
    '--sunken': bgColor,
    '--overlay': surfaceColor,
    '--surface-glass': glassColor,
    '--surface-alpha': glassColor,
    '--glass-ink': cssHsl(glassInk),
    '--glass-ink-muted': cssHsl(glassMuted),
    '--ink': inkColor,
    '--ink-muted': mutedColor,
    '--ink-faint': mutedColor,
    '--line': classic ? ELION_PALETTE.hairline : pal ? pal.hairline : hsl(baseHue, 23, dark ? 21 : 84),
    '--line-strong': hsl(baseHue, 22, dark ? 38 : 60),
    '--primary': current,
    '--on-primary': pal ? '#FFFFFF' : pickOn(rgbToHsl(colorRgb(current))),
    '--primary-soft': `color-mix(in srgb, ${current} 10%, transparent)`,
    '--accent': current,
    '--on-accent': pickOn(rgbToHsl(colorRgb(current))),
    '--signature': 'linear-gradient(135deg, var(--current), var(--dusk))',
    ...semantics,
    ...Object.fromEntries(chart.map((c, i) => [`--c${i + 1}`, c])),
    '--radius': `${radius}px`,
    '--radius-sm': `${radius === 0 ? 0 : Math.max(2, Math.round(radius / 2))}px`,
    '--radius-lg': `${radius === 0 ? 0 : radius + 4}px`,
    '--glass-blur': `${Math.round(t.glass * 0.24)}px`,
    '--density': String({ compact: 0.82, comfortable: 1, spacious: 1.18 }[t.density]),
    '--shadow-sunken': 'none',
    // iOS-style elevation: cards are separated by fill + hairline, shadows stay
    // whisper-quiet in light and deepen only for floating overlays.
    '--shadow-raised': pal && !dark
      ? '0 1px 2px rgba(0, 0, 0, 0.05)'
      : `0 4px 16px rgba(3, 7, 14, ${dark ? 0.16 : 0.06})`,
    '--shadow-overlay':
      pal && !dark ? '0 12px 40px rgba(0, 0, 0, 0.16)' : `0 16px 48px rgba(3, 7, 14, ${dark ? 0.5 : 0.18})`
  }
  const pairs: ContrastPair[] = [
    { label: 'Body text / surface', fg: inkColor, bg: surfaceColor, ratio: 0, required: 4.5, pass: false },
    {
      label: 'Secondary text / surface',
      fg: mutedColor,
      bg: surfaceColor,
      ratio: 0,
      required: 4.5,
      pass: false
    },
    { label: 'Body text / background', fg: inkColor, bg: bgColor, ratio: 0, required: 4.5, pass: false },
    { label: 'Primary / surface (UI)', fg: current, bg: surfaceColor, ratio: 0, required: 3, pass: false },
    {
      label: 'Control label / current',
      fg: vars['--on-primary'],
      bg: current,
      ratio: 0,
      required: 4.5,
      pass: false
    },
    {
      label: dark ? 'Glass text / brightest wallpaper' : 'Glass text / darkest wallpaper',
      fg: vars['--glass-ink'],
      bg: `rgb(${glassWorst.join(', ')})`,
      ratio: 0,
      required: 4.5,
      pass: false
    },
    {
      label: dark ? 'Glass secondary / brightest wallpaper' : 'Glass secondary / darkest wallpaper',
      fg: vars['--glass-ink-muted'],
      bg: `rgb(${glassWorst.join(', ')})`,
      ratio: 0,
      required: 4.5,
      pass: false
    },
    ...semanticPairs
  ]
  for (const pair of pairs) {
    pair.ratio = rgbContrast(colorRgb(pair.fg), colorRgb(pair.bg))
    pair.pass = pair.ratio >= pair.required
  }
  return { vars, pairs, chart, baseFont: '16px' }
}

export function applyThemeCss(resolved: ResolvedTheme, mode: AuroraTheme['mode']): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(resolved.vars)) root.style.setProperty(k, v)
  root.style.fontSize = resolved.baseFont
  root.style.colorScheme = mode
  root.dataset.mode = mode
}
