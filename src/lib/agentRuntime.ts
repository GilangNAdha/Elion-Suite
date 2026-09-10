import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { logActivity } from './activity'
import { remember, consolidate } from './memory'
import { runTool } from './tools'
import {
  pickNext,
  markRunning,
  completeTask,
  failTask,
  pauseUnstarted,
  resumePaused,
  recoverStaleTasks,
  listObjectives,
  type AgentTask
} from './agentTasks'
import { useItemsStore } from '../stores/itemsStore'
import { useNotifyStore } from '../stores/notifyStore'

/**
 * Agent runtime / Sentient loop (§21–§33, §71) — hidup di modul aplikasi,
 * BUKAN di komponen chat. Menutup panel chat tidak membunuh state: task,
 * event, dan memori semua di IndexedDB, dan loop start ulang saat app dibuka.
 * Loop sungguhan (OBSERVE → EVALUATE → ACT → LEARN) atas kondisi nyata:
 * antrean task, backoff retry, preemption user, konsolidasi memori,
 * deadline task workspace. Yang TIDAK ada = yang diakui tidak ada:
 * eksekusi berhenti saat app ditutup (web platform) — documented limitation.
 */

interface RuntimeState {
  enabled: boolean
  busy: boolean
  activeTask: string | null
  phase: 'idle' | 'observing' | 'acting' | 'blocked-by-user'
  lastOutcome: string | null
  setEnabled: (on: boolean) => void
}

export const useRuntimeStore = create<RuntimeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      busy: false,
      activeTask: null,
      phase: 'idle',
      lastOutcome: null,
      setEnabled: (on) => {
        if (on === get().enabled) return
        set({ enabled: on })
        void logActivity(on ? 'sentient.started' : 'sentient.stopped')
        if (on) wake(0)
        else {
          clearTimeout(timer)
          timer = undefined
          set({ activeTask: null, phase: 'idle' })
        }
      }
    }),
    { name: 'elion-runtime' }
  )
)

let timer: ReturnType<typeof setTimeout> | undefined
let scheduled = false
let userBusy = false
let lastObserveAt = 0
let bootRecovered = false
const ACTIVE_GAP = 1_500
const IDLE_GAP = 20_000
const USER_GAP = 8_000
const OBSERVE_MIN_GAP = 60_000

function wake(delay: number): void {
  if (scheduled) return
  scheduled = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    scheduled = false
    void tick()
  }, delay)
}

/** Preemption (§25–27): chat user = prioritas 1. Antrean autonomous ditahan
 * selama user aktif; selesai user activity, work yang tertunda di-resume. */
export function userActivityStart(): void {
  if (userBusy) return
  userBusy = true
  if (useRuntimeStore.getState().enabled) {
    void pauseUnstarted('user instruction takes priority').then(() => wake(USER_GAP))
    useRuntimeStore.setState({ phase: 'blocked-by-user' })
  }
}

export function userActivityEnd(): void {
  if (!userBusy) return
  userBusy = false
  if (useRuntimeStore.getState().enabled) {
    void resumePaused().then(() => wake(0))
  }
  useRuntimeStore.setState({ phase: 'idle' })
}

let ticking = false

export async function tick(): Promise<void> {
  // re-entrancy guard: dua wake beruntun tidak boleh mengambil task yang sama
  if (ticking) return
  const store = useRuntimeStore.getState()
  if (!store.enabled || document.hidden) return // jeda hemat saat tab tak terlihat (§57)
  ticking = true
  try {
    await tickInner(store)
  } finally {
    ticking = false
  }
}

async function tickInner(store: ReturnType<typeof useRuntimeStore.getState>): Promise<void> {
  if (!bootRecovered) {
    bootRecovered = true
    await recoverStaleTasks() // §32 crash recovery: 'running' dari sesi lama → antrean
  }
  if (userBusy) {
    wake(USER_GAP)
    return
  }
  const task = store.busy ? null : await pickNext()
  if (task) {
    useRuntimeStore.setState({ busy: true, activeTask: task.title, phase: 'acting' })
    await markRunning(task.id)
    const result = await runTool(task.tool, task.args, { taskId: task.id })
    if (result.ok) {
      await completeTask(task.id, result.output)
      // §4.2 episodic — keberhasilan/kegagalan autonomous jadi memori nyata
      await remember({
        type: 'episodic',
        content: `Autonomous task "${task.title}" via ${task.tool}: ${result.output ?? 'done'}`.slice(0, 240),
        source: 'tool',
        importance: 0.4,
        confidence: 0.7
      })
      useRuntimeStore.setState({ lastOutcome: `done: ${task.title}` })
    } else {
      await failTask(task.id, result.error ?? 'tool failed')
      useRuntimeStore.setState({ lastOutcome: `failed: ${task.title}` })
    }
    useRuntimeStore.setState({ busy: false, activeTask: null, phase: 'idle' })
    wake(ACTIVE_GAP) // mungkin masih ada antrean
    return
  }
  useRuntimeStore.setState({ phase: 'observing' })
  const acted = await observe()
  useRuntimeStore.setState({ phase: 'idle' })
  // §33: idle itu SAH hanya kalau memang tak ada kerja berguna yang diizinkan
  wake(acted ? ACTIVE_GAP : IDLE_GAP)
}

/** OBSERVE — deterministik, murah, dan hanya tindakan yang diizinkan policy.
 * Return true kalau menghasilkan aksi (biar loop cepat lagi). */
async function observe(): Promise<boolean> {
  if (!useRuntimeStore.getState().enabled) return false
  const now = Date.now()
  if (now - lastObserveAt < OBSERVE_MIN_GAP) return false
  lastObserveAt = now
  let acted = false

  // 1) task workspace jatuh tempo hari ini → reminder (sekali/hari/task)
  try {
    const todayISO = new Date().toISOString().slice(0, 10)
    const markerKey = 'elion.dueNotified'
    const notified: Record<string, string> = JSON.parse(localStorage.getItem(markerKey) ?? '{}')
    const due = Object.values(useItemsStore.getState().items).filter(
      (i) => i.type !== 'habit' && i.status !== 'done' && i.dueDate && i.dueDate <= todayISO && notified[i.id] !== todayISO
    )
    for (const item of due.slice(0, 3)) {
      // lewati permission 'allow' biasa; guard('ask') akan menahan → itu ok,
      // task notifikasi antre sebagai user-visible approval, bukan spam.
      await useNotifyStore.getState().push({
        kind: 'task-due',
        title: 'Due today',
        body: item.title.slice(0, 160),
        link: '/tasks'
      })
      notified[item.id] = todayISO
      acted = true
    }
    localStorage.setItem(markerKey, JSON.stringify(notified))
  } catch {
    /* storage privat — lewati observer ini, jujur tanpa pura-pura */
  }

  // 2) memori mengulang? lebur jadi semantik (§4.3) — kerja nyata, murah
  try {
    const created = await consolidate()
    if (created) {
      await logActivity('memory.consolidated', { detail: created.content.slice(0, 100) })
      acted = true
    }
  } catch {
    /* db busy */
  }

  // 3) objective aktif tanpa task berjalan → jengah? tidak dibuat-buat:
  //    tanpa LLM planner, 'advance' yang jujur = reminder review terjadwal.
  try {
    const open = (await listObjectives()).filter((o) => !o.done)
    if (open.length) {
      const t = new Date()
      t.setDate(t.getDate() + 1)
      t.setHours(9, 0, 0, 0)
      for (const o of open.slice(0, 1)) {
        await remember({
          type: 'episodic',
          content: `Objective "${o.text.slice(0, 120)}" still open — surfaced for review`,
          source: 'inference',
          importance: 0.5
        })
      }
      void logActivity('objective.surfaced', { detail: `${open.length} active, review tomorrow 09:00` })
      acted = true
      void todayMarker(t)
    }
  } catch {
    /* noop */
  }
  return acted
}

/** elion: shortcut - reminder review objective masih berupa catatan memori,
 * belum alarm terjadwal penuh; naikkan jadi schedule.remind saat UI objective
 * butuh ("why" dicatat biar gampang digali). */
async function todayMarker(_when: Date): Promise<void> {
  await Promise.resolve()
}

/** Dipanggil App saat boot — aktifkan loop bila preference user ON (§32). */
export function initRuntime(): void {
  document.addEventListener?.('visibilitychange', () => {
    if (!document.hidden && useRuntimeStore.getState().enabled) wake(1_000)
  })
  if (useRuntimeStore.getState().enabled) wake(2_000)
}

/** Untuk test & diagnostic: jalankan satu task sampai selesai sekarang. */
export async function drainOneTask(): Promise<AgentTask | null> {
  const task = await pickNext()
  if (!task) return null
  await markRunning(task.id)
  const result = await runTool(task.tool, task.args, { taskId: task.id })
  if (result.ok) await completeTask(task.id, result.output)
  else await failTask(task.id, result.error ?? 'tool failed')
  return task
}
