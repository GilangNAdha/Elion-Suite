import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

// Explicit alpha placeholder lets Tailwind generate bg-surface/60, etc.
// A bare var(--surface) makes v3 silently omit those utilities.
const paint = (token: string) => `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-sm)',
      md: 'var(--radius-sm)',
      lg: 'var(--radius)',
      xl: 'var(--radius)',
      '2xl': 'var(--radius-lg)',
      '3xl': 'var(--radius-lg)',
      full: 'var(--radius-pill)'
    },
    spacing: Object.fromEntries(
      Object.entries(defaultTheme.spacing).map(([k, v]) => [k, `var(--space-${k.replace('.', '_')}, ${v})`])
    ),
    extend: {
      colors: {
        bg: paint('bg'),
        surface: paint('surface'),
        raised: paint('raised'),
        sunken: paint('sunken'),
        overlay: paint('overlay'),
        ink: {
          DEFAULT: paint('ink'),
          muted: paint('ink-muted'),
          faint: paint('ink-faint')
        },
        line: { DEFAULT: paint('line'), strong: paint('line-strong') },
        ember: paint('ember'),
        primary: {
          DEFAULT: paint('primary'),
          on: paint('on-primary'),
          soft: paint('primary-soft')
        },
        accent: {
          DEFAULT: paint('accent'),
          on: paint('on-accent')
        },
        ok: paint('ok'),
        warn: paint('warn'),
        bad: paint('bad'),
        info: paint('info'),
        c1: paint('c1'),
        c2: paint('c2'),
        c3: paint('c3'),
        c4: paint('c4'),
        c5: paint('c5'),
        c6: paint('c6')
      },
      borderRadius: {
        token: 'var(--radius)',
        'token-sm': 'var(--radius-sm)',
        'token-lg': 'var(--radius-lg)'
      },
      boxShadow: {
        sunken: 'var(--shadow-sunken)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)'
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      transitionDuration: {
        DEFAULT: 'var(--duration-micro)',
        '150': 'var(--duration-micro)',
        '200': 'var(--duration-micro)',
        '400': 'var(--duration-page)'
      },
      transitionTimingFunction: { DEFAULT: 'var(--ease)' }
    }
  },
  plugins: []
} satisfies Config
