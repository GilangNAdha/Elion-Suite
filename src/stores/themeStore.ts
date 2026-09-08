import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuroraTheme } from '../lib/types'
import { ELION_SEED } from '../tokens/theme'

export const DEFAULT_THEME: AuroraTheme = {
  id: 'default',
  name: 'Premium dark glass',
  seed: { ...ELION_SEED },
  harmony: 'analogous',
  mode: 'dark',
  density: 'comfortable',
  radius: 12,
  glass: 83
}

export const BUILT_IN_PRESETS: AuroraTheme[] = [
  { ...DEFAULT_THEME },
  {
    id: 'preset-ember',
    name: 'Ember',
    seed: { h: 16, s: 78, l: 56 },
    harmony: 'split-complementary',
    mode: 'dark',
    density: 'comfortable',
    radius: 14,
    glass: 25
  },
  {
    id: 'preset-lagoon',
    name: 'Lagoon',
    seed: { h: 190, s: 70, l: 55 },
    harmony: 'analogous',
    mode: 'dark',
    density: 'comfortable',
    radius: 10,
    glass: 45
  },
  {
    id: 'preset-orchid',
    name: 'Orchid',
    seed: { h: 288, s: 62, l: 64 },
    harmony: 'triadic',
    mode: 'dark',
    density: 'comfortable',
    radius: 16,
    glass: 30
  },
  {
    id: 'preset-moss',
    name: 'Moss',
    seed: { h: 130, s: 45, l: 52 },
    harmony: 'analogous',
    mode: 'light',
    density: 'compact',
    radius: 12,
    glass: 20
  },
  {
    id: 'preset-graphite',
    name: 'Graphite',
    seed: { h: 220, s: 10, l: 62 },
    harmony: 'monochromatic',
    mode: 'dark',
    density: 'comfortable',
    radius: 8,
    glass: 15
  }
]

export function isValidTheme(value: unknown): value is AuroraTheme {
  if (!value || typeof value !== 'object') return false
  const t = value as AuroraTheme
  return (
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    !!t.seed &&
    Number.isFinite(t.seed.h) &&
    t.seed.h >= 0 &&
    t.seed.h <= 360 &&
    Number.isFinite(t.seed.s) &&
    t.seed.s >= 0 &&
    t.seed.s <= 100 &&
    Number.isFinite(t.seed.l) &&
    t.seed.l >= 0 &&
    t.seed.l <= 100 &&
    ['dark', 'light'].includes(t.mode) &&
    ['compact', 'comfortable', 'spacious'].includes(t.density) &&
    ['complementary', 'analogous', 'triadic', 'split-complementary', 'monochromatic'].includes(t.harmony) &&
    Number.isFinite(t.radius) &&
    t.radius >= 0 &&
    t.radius <= 24 &&
    Number.isFinite(t.glass) &&
    t.glass >= 0 &&
    t.glass <= 100
  )
}

interface ThemeState {
  theme: AuroraTheme
  presets: AuroraTheme[]
  reducedMotion: boolean
  setTheme: (t: AuroraTheme) => void
  patch: (p: Partial<AuroraTheme>) => void
  addPreset: (t: AuroraTheme) => void
  removePreset: (id: string) => void
  applyPreset: (id: string) => void
  setReducedMotion: (v: boolean) => void
  exportJSON: () => string
  importJSON: (json: string) => boolean
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      presets: BUILT_IN_PRESETS,
      reducedMotion: false,
      setTheme: (t) => set({ theme: t }),
      patch: (p) =>
        set((s) => ({
          theme: { ...s.theme, ...p, id: s.theme.id, name: p.name ?? s.theme.name }
        })),
      addPreset: (t) => set((s) => ({ presets: [...s.presets.filter((p) => p.id !== t.id), t] })),
      removePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id || p.id === 'default') })),
      applyPreset: (id) => {
        const p = get().presets.find((x) => x.id === id)
        if (p) set({ theme: { ...p } })
      },
      setReducedMotion: (v) => set({ reducedMotion: v }),
      exportJSON: () => JSON.stringify({ theme: get().theme, presets: get().presets }, null, 2),
      importJSON: (json) => {
        try {
          const data = JSON.parse(json) as { theme?: AuroraTheme; presets?: AuroraTheme[] }
          if (!data || typeof data !== 'object' || (!data.theme && !data.presets)) return false
          if (data.theme && !isValidTheme(data.theme)) return false
          if (data.presets && (!Array.isArray(data.presets) || !data.presets.every(isValidTheme)))
            return false
          set({
            ...(data.theme ? { theme: data.theme } : {}),
            ...(data.presets ? { presets: data.presets } : {})
          })
          return true
        } catch {
          return false
        }
      }
    }),
    {
      name: 'elion-theme',
      version: 1,
      migrate: (persisted) => {
        const old = persisted as Pick<ThemeState, 'theme' | 'presets' | 'reducedMotion'>
        // Only upgrade the untouched previous factory preset; preserve custom
        // seeds, density, glass and user-saved presets across this design pass.
        const untouched = (t: AuroraTheme) =>
          t.id === 'default' &&
          t.name === 'Aurora Night' &&
          t.seed.h === 228 &&
          t.seed.s === 68 &&
          t.seed.l === 60 &&
          t.harmony === 'complementary' &&
          t.mode === 'dark' &&
          t.density === 'comfortable' &&
          t.radius === 12 &&
          t.glass === 35
        return {
          ...old,
          theme: old.theme && untouched(old.theme) ? DEFAULT_THEME : (old.theme ?? DEFAULT_THEME),
          presets: (old.presets ?? BUILT_IN_PRESETS).map((p) => (untouched(p) ? DEFAULT_THEME : p))
        }
      },
      partialize: (s) => ({ theme: s.theme, presets: s.presets, reducedMotion: s.reducedMotion })
    }
  )
)
