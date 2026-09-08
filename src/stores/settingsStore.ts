import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VoiceModel } from '../lib/voice/types'

export interface SttSettings {
  enabled: boolean
  model: VoiceModel
  language: string
  dictionary: string[]
  mode: 'toggle' | 'hold'
  shortcut: 'mod+shift+space' | 'mod+alt+d'
  desktopShortcut: boolean
}

export type PetStyle = 'nova' | 'classic' | 'duel'

interface SettingsState {
  ready: boolean
  profileName: string
  stt: SttSettings
  petStyle: PetStyle
  guard: { enabled: boolean; thresholdMs: number; bringToFront: boolean }
  weather: { lat: number; lon: number; city: string }
  setReady: () => void
  setProfileName: (n: string) => void
  setStt: (p: Partial<SttSettings>) => void
  setPetStyle: (p: PetStyle) => void
  setGuard: (p: Partial<SettingsState['guard']>) => void
  setWeather: (p: Partial<SettingsState['weather']>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ready: false,
      profileName: 'You',
      stt: {
        enabled: true,
        model: 'Xenova/whisper-tiny',
        language: 'en',
        dictionary: [],
        mode: 'toggle',
        shortcut: 'mod+shift+space',
        desktopShortcut: false
      },
      petStyle: 'nova',
      guard: { enabled: true, thresholdMs: 8000, bringToFront: false },
      weather: { lat: -6.2, lon: 106.85, city: 'Jakarta' },
      setReady: () => set({ ready: true }),
      setProfileName: (n) => set({ profileName: n }),
      setStt: (p) => set((s) => ({ stt: { ...s.stt, ...p } })),
      setPetStyle: (p) => set({ petStyle: p }),
      setGuard: (p) => set((s) => ({ guard: { ...s.guard, ...p } })),
      setWeather: (p) => set((s) => ({ weather: { ...s.weather, ...p } }))
    }),
    {
      name: 'elion-settings',
      version: 1,
      migrate: (persisted) => ({
        ...(persisted as Pick<SettingsState, 'profileName' | 'stt' | 'petStyle' | 'guard' | 'weather'>),
        petStyle: 'nova' as PetStyle
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState>
        return { ...current, ...saved, stt: { ...current.stt, ...saved?.stt } }
      },
      partialize: (s) => ({
        profileName: s.profileName,
        stt: s.stt,
        petStyle: s.petStyle,
        guard: s.guard,
        weather: s.weather
      })
    }
  )
)
