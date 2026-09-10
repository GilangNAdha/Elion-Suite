import { create } from 'zustand'
import { db } from './db'
import { logActivity } from './activity'
import { useNotifyStore } from '../stores/notifyStore'

/**
 * Permission manager (§14, §46, §51, §52, §59).
 * Prinsip default: data user tidak keluar tanpa izin — aksi low-risk internal
 * boleh jalan; aksi ber-egres / ireversibel = 'ask' atau 'deny'.
 * Semua keputusan tercatat sebagai event (agent tidak "dengar" monitor —
 * lapisan eksekusi yang mencatat, §36).
 */

export type PermissionMode = 'allow' | 'ask' | 'deny'

export interface PermissionRow {
  key: string
  mode: PermissionMode
  updatedAt: string
}

export interface PermissionDef {
  key: string
  label: string
  /** risk 'low' = internal; 'high' = keluar perangkat / ireversibel */
  risk: 'low' | 'high'
  default: PermissionMode
}

export const PERMISSIONS: PermissionDef[] = [
  { key: 'workspace.read', label: 'Read workspace', risk: 'low', default: 'allow' },
  { key: 'workspace.write', label: 'Organize workspace objects', risk: 'low', default: 'allow' },
  { key: 'tasks.write', label: 'Create / update tasks', risk: 'low', default: 'allow' },
  { key: 'memory.write', label: 'Store memories', risk: 'low', default: 'allow' },
  { key: 'notifications.send', label: 'Send notifications', risk: 'low', default: 'allow' },
  { key: 'schedule.write', label: 'Create reminders', risk: 'low', default: 'allow' },
  { key: 'browser.read', label: 'Read a web page (leaves device)', risk: 'high', default: 'ask' },
  { key: 'email.read', label: 'Read email', risk: 'high', default: 'ask' },
  { key: 'files.read', label: 'Read local files (desktop only)', risk: 'high', default: 'ask' },
  { key: 'browser.interact', label: 'Interact with websites', risk: 'high', default: 'deny' },
  { key: 'email.send', label: 'Send email', risk: 'high', default: 'deny' },
  { key: 'files.write', label: 'Write local files', risk: 'high', default: 'deny' },
  { key: 'system.action', label: 'Run system commands', risk: 'high', default: 'deny' },
  // Hermes gateway (docs/HERMES-SETUP.md): delegasi = egress via provider
  // Hermes; job terjadwal = kerja unattended yang juga egress → confirm first.
  // Impor skill = tulis lokal aditif ke ledger → low-risk (aturan Part VII:
  // skill BARU boleh otonom; yang diubah tetap lewat review).
  { key: 'hermes.delegate', label: 'Delegate work to the Hermes agent', risk: 'high', default: 'ask' },
  { key: 'hermes.control', label: 'Create / change scheduled Hermes jobs', risk: 'high', default: 'ask' },
  { key: 'hermes.skills', label: 'Import Hermes skills into the ledger', risk: 'low', default: 'allow' }
]

const def = (key: string) => PERMISSIONS.find((p) => p.key === key)

interface Approval {
  id: string
  key: string
  reason: string
  at: string
}

interface PermissionState {
  modes: Record<string, PermissionMode>
  ready: boolean
  approvals: Approval[]
  init: () => Promise<void>
  setMode: (key: string, mode: PermissionMode | null) => Promise<void>
  resolve: (id: string, decision: 'once' | 'always' | 'deny') => Promise<void>
}

const waiters = new Map<string, (d: 'granted' | 'denied') => void>()

export const usePermissionStore = create<PermissionState>()((set, get) => ({
  modes: {},
  ready: false,
  init: async () => {
    const rows = await db.permissions.toArray()
    set({ modes: Object.fromEntries(rows.map((r) => [r.key, r.mode])), ready: true })
  },
  setMode: async (key, mode) => {
    if (!def(key)) return
    if (mode === null) {
      await db.permissions.delete(key)
      set({ modes: Object.fromEntries(Object.entries(get().modes).filter(([k]) => k !== key)) })
    } else {
      await db.permissions.put({ key, mode, updatedAt: new Date().toISOString() })
      set({ modes: { ...get().modes, [key]: mode } })
    }
    await logActivity('permission.changed', { detail: `${key} → ${mode ?? 'default'}` })
  },
  approvals: [],
  resolve: async (id, decision) => {
    const a = get().approvals.find((x) => x.id === id)
    if (!a) return
    set({ approvals: get().approvals.filter((x) => x.id !== id) })
    if (decision === 'always') await get().setMode(a.key, 'allow')
    waiters.get(id)?.(decision === 'deny' ? 'denied' : 'granted')
    waiters.delete(id)
    await logActivity(decision === 'deny' ? 'permission.denied' : 'permission.granted', {
      detail: `${a.key} (${decision})`
    })
  }
}))

export function effectiveMode(key: string): PermissionMode {
  return usePermissionStore.getState().modes[key] ?? def(key)?.default ?? 'deny'
}

/**
 * Pintu gerbang sebelum tool apa pun dieksekusi.
 * 'ask' = request masuk antrean approval + desktop notification; task yang
 * memanggil menahan (await) sampai user memutuskan — tidak pernah diam-diam
 * dianggap boleh, dan tidak pernah dianggap selesai (§68).
 */
export async function guard(key: string, reason: string): Promise<'granted' | 'denied'> {
  const mode = effectiveMode(key)
  if (mode === 'allow') return 'granted'
  if (mode === 'deny') {
    await logActivity('permission.denied', { detail: `${key} (policy)` })
    return 'denied'
  }
  const store = usePermissionStore.getState()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const approval: Approval = { id, key, reason, at: new Date().toISOString() }
  usePermissionStore.setState({ approvals: [...usePermissionStore.getState().approvals, approval] })
  // §36: lapisan eksekusi yang mencatat — permintaan masuk antrean approval
  // adalah event nyata, biar timeline menunjukkan kenapa loop sedang menahan.
  await logActivity('permission.requested', { detail: `${key} — ${reason.slice(0, 120)}` })
  const label = def(key)?.label ?? key
  void useNotifyStore
    .getState()
    .push({ kind: 'system', title: 'ELION needs permission', body: `${label} — ${reason}`.slice(0, 180), link: '/settings#runtime' })
  return new Promise((resolve) => waiters.set(id, resolve))
}
