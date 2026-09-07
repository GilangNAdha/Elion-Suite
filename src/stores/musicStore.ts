import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, type MusicTrack } from '../lib/types'

export type PlayerSkin = 'minimal' | 'disc' | 'turntable'

interface MusicState {
  tracks: MusicTrack[]
  currentId: string | null
  playing: boolean
  volume: number
  skin: PlayerSkin
  position: number
  duration: number
  addFiles: (t: MusicTrack[]) => void
  addYoutube: (url: string, name?: string) => void
  removeTrack: (id: string) => void
  select: (id: string) => void
  setPlaying: (v: boolean) => void
  setVolume: (v: number) => void
  setSkin: (s: PlayerSkin) => void
  setPosition: (p: number) => void
  setDuration: (d: number) => void
  requestSeek: (t: number) => void
  seekSignal: number
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      tracks: [],
      currentId: null,
      playing: false,
      volume: 0.8,
      skin: 'disc',
      position: 0,
      duration: 0,
      seekSignal: 0,
      addFiles: (t) =>
        set((s) => ({
          tracks: [...s.tracks, ...t],
          currentId: s.currentId ?? t[0]?.id ?? null
        })),
      addYoutube: (url, name) =>
        set((s) => ({
          tracks: [
            ...s.tracks,
            { id: uid(), name: name || 'YouTube track', src: url, kind: 'youtube' }
          ],
          currentId: s.currentId ?? undefined
        })),
      removeTrack: (id) =>
        set((s) => {
          const tracks = s.tracks.filter((t) => t.id !== id)
          return {
            tracks,
            currentId: s.currentId === id ? tracks[0]?.id ?? null : s.currentId
          }
        }),
      select: (id) => set({ currentId: id, playing: true, position: 0 }),
      setPlaying: (v) => set({ playing: v }),
      setVolume: (v) => set({ volume: v }),
      setSkin: (sk) => set({ skin: sk }),
      setPosition: (p) => set({ position: p }),
      setDuration: (d) => set({ duration: d }),
      requestSeek: (t) => set({ position: t, seekSignal: get().seekSignal + 1 })
    }),
    {
      name: 'elion-music',
      partialize: (s) => ({
        // File tracks are object URLs — not restorable after reload; keep youtube only.
        tracks: s.tracks.filter((t) => t.kind === 'youtube'),
        currentId:
          s.tracks.find((t) => t.id === s.currentId)?.kind === 'youtube' ? s.currentId : null,
        volume: s.volume,
        skin: s.skin
      })
    }
  )
)
