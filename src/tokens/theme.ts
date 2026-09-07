// §5 — Theming engine: seed color → HSL harmony → semantic tokens → WCAG
// contrast check with auto-correction. Resolves to CSS variables applied
// globally; the Lockdown theme-override is the only consumer allowed to
// deviate per preset.

import type { AuroraTheme, Harmony } from '../lib/types'

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
  const towardBg = relativeLuminance(hslToRgb(bg.h, bg.s, bg.l)) > 0.4 ? -1 : 1
  while (contrastRatio({ h, s, l }, bg) < required && guard < 200) {
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

const DENSITY_FONT: Record<AuroraTheme['density'], string> = {
  compact: '13.5px',
  comfortable: '15px',
  spacious: '16.5px'
}

export function deriveTheme(t: AuroraTheme): ResolvedTheme {
  const { h, s } = t.seed
  const dark = t.mode === 'dark'
  const hues = harmonize(h, t.harmony)
  const accentHue = hues[1] ?? mod(h + 30)

  const bg: Hsl = dark ? { h, s: 16, l: 7 } : { h, s: 32, l: 96 }
  const surface: Hsl = dark ? { h, s: 14, l: 11 } : { h, s: 30, l: 98.5 }
  const raised: Hsl = dark ? { h, s: 13, l: 15 } : { h, s: 30, l: 100 }
  const sunken: Hsl = dark ? { h, s: 18, l: 4.5 } : { h, s: 32, l: 91 }
  const overlay: Hsl = dark ? { h, s: 16, l: 18 } : { h, s: 30, l: 100 }

  const ink = autoFixContrast(dark ? { h, s: 15, l: 92 } : { h, s: 20, l: 16 }, surface, 4.5)
  const inkMuted = autoFixContrast(dark ? { h, s: 10, l: 64 } : { h, s: 12, l: 40 }, surface, 4.5)
  const inkFaint = autoFixContrast(dark ? { h, s: 8, l: 52 } : { h, s: 10, l: 52 }, surface, 3)

  const sat = Math.min(85, Math.max(40, s))
  const primary: Hsl = dark ? { h, s: sat, l: 64 } : { h, s: sat, l: 44 }
  const accent: Hsl = dark ? { h: accentHue, s: sat, l: 68 } : { h: accentHue, s: sat, l: 40 }

  const ok: Hsl = dark ? { h: 152, s: 62, l: 46 } : { h: 152, s: 62, l: 34 }
  const warn: Hsl = dark ? { h: 42, s: 92, l: 56 } : { h: 42, s: 90, l: 38 }
  const bad: Hsl = dark ? { h: 4, s: 76, l: 60 } : { h: 4, s: 72, l: 46 }
  const info: Hsl = dark ? { h: 214, s: 86, l: 64 } : { h: 214, s: 76, l: 40 }

  const chartHues: number[] = []
  const push = (hh: number) => {
    if (!chartHues.some((x) => Math.min(Math.abs(x - hh), 360 - Math.abs(x - hh)) < 18)) chartHues.push(mod(hh))
  }
  push(h)
  push(mod(h + 35))
  push(mod(h + 120))
  push(mod(h + 200))
  push(mod(h + 240))
  push(mod(h + 285))
  const chart = chartHues.map((ch, i) =>
    dark ? hsl(ch, 70 - i * 3, 62 - i * 2) : hsl(ch, 65 - i * 3, 44 + i * 2)
  )

  const glassBlur = Math.round(t.glass / 100 * 24)
  const surfaceAlpha = dark ? 0.9 - (t.glass / 100) * 0.35 : 0.92 - (t.glass / 100) * 0.3
  const r = t.radius
  const shadowColor = dark ? '0, 0, 0' : '24, 28, 40'

  const vars: Record<string, string> = {
    '--bg': hsl(bg.h, bg.s, bg.l),
    '--surface': hsl(surface.h, surface.s, surface.l),
    '--surface-alpha': hsl(surface.h, surface.s, surface.l, surfaceAlpha),
    '--raised': hsl(raised.h, raised.s, raised.l),
    '--sunken': hsl(sunken.h, sunken.s, sunken.l),
    '--overlay': hsl(overlay.h, overlay.s, overlay.l, 0.96),
    '--ink': hsl(ink.h, ink.s, ink.l),
    '--ink-muted': hsl(inkMuted.h, inkMuted.s, inkMuted.l),
    '--ink-faint': hsl(inkFaint.h, inkFaint.s, inkFaint.l),
    '--line': dark ? hsl(h, 20, 100, 0.13) : hsl(h, 25, 20, 0.18),
    '--line-strong': dark ? hsl(h, 20, 100, 0.22) : hsl(h, 25, 20, 0.3),
    '--primary': hsl(primary.h, primary.s, primary.l),
    '--on-primary': pickOn(primary),
    '--primary-soft': hsl(primary.h, primary.s, primary.l, 0.16),
    '--accent': hsl(accent.h, accent.s, accent.l),
    '--on-accent': pickOn(accent),
    '--ok': hsl(ok.h, ok.s, ok.l),
    '--warn': hsl(warn.h, warn.s, warn.l),
    '--bad': hsl(bad.h, bad.s, bad.l),
    '--info': hsl(info.h, info.s, info.l),
    '--c1': chart[0],
    '--c2': chart[1],
    '--c3': chart[2],
    '--c4': chart[3],
    '--c5': chart[4],
    '--c6': chart[5],
    '--radius': `${r}px`,
    '--radius-sm': `${Math.max(2, r - 6)}px`,
    '--radius-lg': `${r + 8}px`,
    '--glass-blur': `${glassBlur}px`,
    '--shadow-sunken': dark
      ? 'inset 0 2px 8px rgba(0,0,0,0.45)'
      : 'inset 0 1px 4px rgba(24,28,40,0.12)',
    '--shadow-raised': `0 4px 14px rgba(${shadowColor}, ${dark ? 0.35 : 0.1})`,
    '--shadow-overlay': `0 16px 48px rgba(${shadowColor}, ${dark ? 0.55 : 0.18})`
  }

  const pairs: ContrastPair[] = [
    { label: 'Body text / surface', fg: vars['--ink'], bg: vars['--surface'], ratio: 0, required: 4.5, pass: false },
    { label: 'Muted text / surface', fg: vars['--ink-muted'], bg: vars['--surface'], ratio: 0, required: 4.5, pass: false },
    { label: 'Body text / background', fg: vars['--ink'], bg: vars['--bg'], ratio: 0, required: 4.5, pass: false },
    { label: 'Button label / primary', fg: vars['--on-primary'], bg: vars['--primary'], ratio: 0, required: 4.5, pass: false },
    { label: 'Accent label / accent', fg: vars['--on-accent'], bg: vars['--accent'], ratio: 0, required: 4.5, pass: false },
    { label: 'Primary / surface (UI)', fg: vars['--primary'], bg: vars['--surface'], ratio: 0, required: 3, pass: false }
  ]
  const parse = (v: string): Hsl => {
    const m = v.match(/hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%/)
    return m ? { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) } : { h: 0, s: 0, l: 50 }
  }
  for (const p of pairs) {
    p.ratio = contrastRatio(parse(p.fg), parse(p.bg))
    p.pass = p.ratio >= p.required - 0.05
  }

  return { vars, pairs, chart, baseFont: DENSITY_FONT[t.density] }
}

export function applyThemeCss(resolved: ResolvedTheme, mode: AuroraTheme['mode']): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(resolved.vars)) root.style.setProperty(k, v)
  root.style.fontSize = resolved.baseFont
  root.dataset.mode = mode
}
