import { create } from 'zustand'
import type { PetMoodState } from '../lib/types'

// One mood state, shared by the Dashboard companion and the Lockdown pet
// widget (§7 — the pet does not have two independent moods).

interface PetState extends PetMoodState {
  bumpHappy: () => void
  happyUntil: number
  tick: (input: { focusActive: boolean; overdueCount: number; doneToday: boolean; hour: number }) => void
}

export const usePetStore = create<PetState>()((set, get) => ({
  mood: 'idle',
  since: new Date().toISOString(),
  happyUntil: 0,
  bumpHappy: () =>
    set((s) => ({
      happyUntil: Date.now() + 10 * 60 * 1000,
      mood: s.mood === 'focused' ? 'focused' : 'happy',
      since: new Date().toISOString()
    })),
  tick: ({ focusActive, overdueCount, doneToday, hour }) => {
    const current = get().mood
    let mood: PetMoodState['mood'] = 'idle'
    if (focusActive) mood = 'focused'
    else if (Date.now() < get().happyUntil || (doneToday && hour < 22)) mood = 'happy'
    else if (overdueCount > 0) mood = 'worried'
    else if (hour >= 23 || hour < 5) mood = 'tired'
    if (mood !== current) set({ mood, since: new Date().toISOString() })
  }
}))
