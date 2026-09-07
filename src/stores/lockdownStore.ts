import { create } from 'zustand'
import { db, type BlobRecord } from '../lib/db'
import {
  uid,
  type FocusSession,
  type LockdownPreset,
  type PomodoroConfig,
  type SoundscapeMix,
  type WidgetInstance
} from '../lib/types'

export const DEFAULT_POMODORO: PomodoroConfig = { workMin: 25, breakMin: 5, goalCycles: 4 }
export const DEFAULT_MIX: SoundscapeMix = {
  layers: { rain: 0.5, fire: 0.3, white: 0, cafe: 0, wind: 0 }
}

export interface ActiveTimer {
  phase: 'work' | 'break' | 'idle'
  endsAt: number | null
  cyclesDone: number
  running: boolean
}

interface LockdownState {
  presets: Record<string, LockdownPreset>
  sessions: FocusSession[]
  ready: boolean
  active: { presetId: string; objective: string; start: string; interruptions: number } | null
  timer: ActiveTimer

  init: () => Promise<void>
  createPreset: (name: string) => Promise<LockdownPreset>
  updatePreset: (id: string, patch: Partial<LockdownPreset>) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  duplicatePreset: (id: string) => Promise<LockdownPreset | null>

  startSession: (presetId: string, objective: string) => void
  logInterruption: () => void
  endSession: (cycles: number) => Promise<void>

  setTimer: (t: Partial<ActiveTimer>) => void

  setWidget: (presetId: string, w: WidgetInstance) => Promise<void>
  removeWidget: (presetId: string, widgetId: string) => Promise<void>
  setPomodoro: (presetId: string, cfg: PomodoroConfig) => Promise<void>
  setMix: (presetId: string, mix: SoundscapeMix) => Promise<void>

  putBlob: (b: BlobRecord) => Promise<void>
  getBlob: (id: string) => Promise<BlobRecord | undefined>
  deleteBlob: (id: string) => Promise<void>
}

export const useLockdownStore = create<LockdownState>()((set, get) => ({
  presets: {},
  sessions: [],
  ready: false,
  active: null,
  timer: { phase: 'idle', endsAt: null, cyclesDone: 0, running: false },

  init: async () => {
    const [presets, sessions] = await Promise.all([
      db.lockdownPresets.toArray(),
      db.lockdownSessions.orderBy('start').reverse().limit(200).toArray()
    ])
    set({
      ready: true,
      presets: Object.fromEntries(presets.map((p) => [p.id, p])),
      sessions
    })
  },

  createPreset: async (name) => {
    const now = new Date().toISOString()
    const p: LockdownPreset = {
      id: uid(),
      name,
      wallpaper: { tier: 'static', scene: 'particles' },
      soundscape: { ...DEFAULT_MIX, layers: { ...DEFAULT_MIX.layers } },
      pomodoro: { ...DEFAULT_POMODORO },
      widgets: [
        { id: uid(), type: 'clock', x: 64, y: 64, w: 220, h: 120 },
        { id: uid(), type: 'timer', x: 320, y: 64, w: 260, h: 180 }
      ],
      createdAt: now,
      updatedAt: now
    }
    await db.lockdownPresets.add(p)
    set({ presets: { ...get().presets, [p.id]: p } })
    return p
  },

  updatePreset: async (id, patch) => {
    const cur = get().presets[id]
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
    await db.lockdownPresets.put(next)
    set({ presets: { ...get().presets, [id]: next } })
  },

  deletePreset: async (id) => {
    await db.lockdownPresets.delete(id)
    const presets = { ...get().presets }
    delete presets[id]
    set({ presets })
  },

  duplicatePreset: async (id) => {
    const cur = get().presets[id]
    if (!cur) return null
    const copy: LockdownPreset = {
      ...cur,
      id: uid(),
      name: `${cur.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      widgets: cur.widgets.map((w) => ({ ...w, id: uid() }))
    }
    await db.lockdownPresets.add(copy)
    set({ presets: { ...get().presets, [copy.id]: copy } })
    return copy
  },

  startSession: (presetId, objective) =>
    set({
      active: { presetId, objective, start: new Date().toISOString(), interruptions: 0 }
    }),

  logInterruption: () => {
    const a = get().active
    if (a) set({ active: { ...a, interruptions: a.interruptions + 1 } })
  },

  endSession: async (cycles) => {
    const a = get().active
    if (!a) return
    const preset = get().presets[a.presetId]
    const session: FocusSession = {
      id: uid(),
      presetId: a.presetId,
      presetName: preset?.name ?? 'Custom',
      objective: a.objective,
      start: a.start,
      end: new Date().toISOString(),
      interruptions: a.interruptions,
      cyclesCompleted: cycles
    }
    await db.lockdownSessions.add(session)
    set({
      sessions: [session, ...get().sessions],
      active: null,
      timer: { phase: 'idle', endsAt: null, cyclesDone: 0, running: false }
    })
  },

  setTimer: (t) => set({ timer: { ...get().timer, ...t } }),

  setWidget: async (presetId, w) => {
    const p = get().presets[presetId]
    if (!p) return
    const widgets = p.widgets.some((x) => x.id === w.id)
      ? p.widgets.map((x) => (x.id === w.id ? w : x))
      : [...p.widgets, w]
    await get().updatePreset(presetId, { widgets })
  },

  removeWidget: async (presetId, widgetId) => {
    const p = get().presets[presetId]
    if (!p) return
    await get().updatePreset(presetId, { widgets: p.widgets.filter((w) => w.id !== widgetId) })
  },

  setPomodoro: async (presetId, cfg) => get().updatePreset(presetId, { pomodoro: cfg }),
  setMix: async (presetId, mix) =>
    get().updatePreset(presetId, { soundscape: { layers: { ...mix.layers } } }),

  putBlob: async (b) => {
    await db.blobs.put(b)
  },
  getBlob: async (id) => db.blobs.get(id),
  deleteBlob: async (id) => db.blobs.delete(id)
}))
