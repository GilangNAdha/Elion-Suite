import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        overlay: 'var(--overlay)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)'
        },
        line: 'var(--line)',
        primary: {
          DEFAULT: 'var(--primary)',
          on: 'var(--on-primary)',
          soft: 'var(--primary-soft)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          on: 'var(--on-accent)'
        },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        info: 'var(--info)',
        c1: 'var(--c1)',
        c2: 'var(--c2)',
        c3: 'var(--c3)',
        c4: 'var(--c4)',
        c5: 'var(--c5)',
        c6: 'var(--c6)'
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
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config
