import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuroraTheme } from '../lib/types'

export const DEFAULT_THEME: AuroraTheme = {
  id: 'default',
  name: 'Aurora Night',
  seed: { h: 228, s: 68, l: 60 },
  harmony: 'complementary',
  mode: 'dark',
  density: 'comfortable',
  radius: 12,
  glass: 35
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
          if (data.theme) set({ theme: data.theme })
          if (Array.isArray(data.presets)) set({ presets: data.presets })
          return true
        } catch {
          return false
        }
      }
    }),
    {
      name: 'elion-theme',
      partialize: (s) => ({ theme: s.theme, presets: s.presets, reducedMotion: s.reducedMotion })
    }
  )
)
