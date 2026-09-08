// Elion's fixed structural scale; CSS equivalents live in foundation.css.
// Theme-aware values are resolved by theme.ts. Art coordinates (sprites, SVG,
// canvas geometry) are not UI spacing and intentionally stay in source pixels.
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
  h1: 32,
  h2: 28,
  h3: 24,
  h4: 20,
  h5: 16,
  h6: 14,
  h7: 12,
  bodyLarge: 16,
  body: 14,
  small: 12,
  metric: 28,
  metricMedium: 24,
  metricSmall: 16,
  displayMin: 72,
  displayMax: 96,
  code: 12,
  codeLine: 20
} as const
export const BREAKPOINTS = [375, 768, 1024, 1440] as const
export const EASE = {
  standard: 'cubic-bezier(0.16, 1, 0.3, 1)',
  enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.16, 1, 0.3, 1)',
  t150: 150,
  t200: 200,
  t400: 400
} as const
export function elevationClass(level: Elevation): string {
  return level === 'default' ? '' : `elev-${level}`
}

// Floating companion dimensions (CSS pixels; normalized positions are persisted).
export const PET_LAYOUT = {
  desktopSize: 112,
  compactSize: 88,
  focusSize: 80,
  compactBreakpoint: 600,
  chromeHeight: 42,
  inset: 16,
  topInset: 56,
  bottomInset: 80,
  gap: 12,
  actionsWidth: 232,
  actionsHeight: 216,
  chatWidth: 352,
  chatHeight: 512,
  keyboardStep: 20
} as const
