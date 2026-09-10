import { create } from 'zustand'
import { db } from './db'
import { uid } from './types'

/**
 * Sistem event (§37) — infrastruktur, bukan narasi. Semua aksi runtime
 * (memory, task, tool, mode) menulis satu baris event ke IndexedDB lewat
 * logActivity(); monitoring UI (§34) hanya boleh membaca dari sini, JANGAN
 * dari jawaban chat. Elion tidak perlu "tahu" sedang dimonitor — catatan
 * dibuat oleh lapisan eksekusi itu sendiri.
 */

export interface AgentEventRecord {
  id: string
  at: string
  kind: string
  taskId?: string
  /** data kecil untuk display; JANGAN taruh isi dokumen/credential di sini */
  detail?: string
}

interface ActivityState {
  events: AgentEventRecord[]
  ready: boolean
  init: () => Promise<void>
  clear: () => Promise<void>
}

export const useActivityFeed = create<ActivityState>()((set, get) => ({
  events: [],
  ready: false,
  init: async () => {
    const rows = await db.agentEvents.orderBy('at').reverse().limit(200).toArray()
    set({ events: rows.reverse(), ready: true })
  },
  clear: async () => {
    await db.agentEvents.clear()
    set({ events: [] })
  }
}))

/** Tulis event sungguhan: persist dulu, baru cermin ke store. Kalau DB gagal,
 * fungsi ini reject — pemanggil tidak boleh pura-pura berhasil (§68). */
export async function logActivity(kind: string, opts: { taskId?: string; detail?: string } = {}): Promise<AgentEventRecord> {
  const rec: AgentEventRecord = { id: uid(), at: new Date().toISOString(), kind, ...opts }
  await db.agentEvents.add(rec)
  // buffer panjang-umur di luar layar tidak berguna — cukup feed 500 terakhir
  const events = [...useActivityFeed.getState().events, rec].slice(-500)
  useActivityFeed.setState({ events })
  return rec
}
