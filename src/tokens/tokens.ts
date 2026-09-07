// §4 — Static design-token foundation (8px grid, 4-layer elevation, type scale)
// Theme-aware values are resolved in tokens/theme.ts; these are the fixed
// structural scales that never change with a theme.

export const SPACE = {
  0: 0,
  25: 1,
  50: 2,
  100: 4,
  200: 8,
  300: 12,
  400: 16,
  500: 24,
  600: 32,
  800: 48,
  1200: 72,
  1600: 96,
  2400: 144
} as const

export const ELEVATION = ['sunken', 'default', 'raised', 'overlay'] as const
export type Elevation = (typeof ELEVATION)[number]

export const TYPE_SCALE = {
  h1: 30,
  h2: 24,
  h3: 19,
  body: 15,
  small: 13,
  metric: 44 // big dashboard numbers
} as const

export const BREAKPOINTS = [375, 768, 1024, 1440] as const

// Easing / timing scale shared by the motion layer (§10)
export const EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  t150: 150,
  t200: 200,
  t300: 300
} as const

export function elevationClass(level: Elevation): string {
  switch (level) {
    case 'sunken':
      return 'elev-sunken'
    case 'raised':
      return 'elev-raised'
    case 'overlay':
      return 'elev-overlay'
    case 'default':
      return ''
  }
}
