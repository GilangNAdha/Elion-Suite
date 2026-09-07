import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SttSettings {
  enabled: boolean
  model: 'Xenova/whisper-tiny' | 'Xenova/whisper-base'
}

interface SettingsState {
  ready: boolean
  profileName: string
  stt: SttSettings
  guard: { enabled: boolean; thresholdMs: number; bringToFront: boolean }
  weather: { lat: number; lon: number; city: string }
  setReady: () => void
  setProfileName: (n: string) => void
  setStt: (p: Partial<SttSettings>) => void
  setGuard: (p: Partial<SettingsState['guard']>) => void
  setWeather: (p: Partial<SettingsState['weather']>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ready: false,
      profileName: 'You',
      stt: { enabled: true, model: 'Xenova/whisper-tiny' },
      guard: { enabled: true, thresholdMs: 8000, bringToFront: false },
      weather: { lat: -6.2, lon: 106.85, city: 'Jakarta' },
      setReady: () => set({ ready: true }),
      setProfileName: (n) => set({ profileName: n }),
      setStt: (p) => set((s) => ({ stt: { ...s.stt, ...p } })),
      setGuard: (p) => set((s) => ({ guard: { ...s.guard, ...p } })),
      setWeather: (p) => set((s) => ({ weather: { ...s.weather, ...p } }))
    }),
    {
      name: 'elion-settings',
      partialize: (s) => ({
        profileName: s.profileName,
        stt: s.stt,
        guard: s.guard,
        weather: s.weather
      })
    }
  )
)
