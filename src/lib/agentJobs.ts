import { db } from './db'
import { uid } from './types'
import { logActivity } from './activity'
import { enqueueTask, PRIORITY } from './agentTasks'

/**
 * Agent cron (Hermes lineage, embedded — docs/HERMES-SETUP.md Part VI).
 * Job terjadwal = instruksi untuk Elion sendiri yang dieksekusi oleh loop
 * Sentient di dalam app: prompt → antrean task (priority: scheduledCommitment)
 * → agent.reason (LLM + tools) → hasil disimpan + notifikasi + event.
 *
 * Jujur soal batas: job jalan selagi app terbuka dan runtime ON — bukan
 * daemon OS. Untuk kerja saat app tertutup, hubungkan gateway Hermes
 * eksternal (Settings › ELION runtime › Hermes gateway).
 */

export type AgentJobKind = 'daily' | 'interval' | 'once'

export interface AgentJob {
  id: string
  name: string
  prompt: string
  kind: AgentJobKind
  /** daily/once: 'HH:MM' lokal (once juga boleh 'YYYY-MM-DDTHH:MM') */
  at?: string
  /** interval: menit */
  intervalMin?: number
  enabled: boolean
  /** epoch ms — gerbang eksekusi berikutnya */
  nextRunAt: number
  lastRunAt?: number
  lastStatus?: 'ok' | 'failed'
  lastResult?: string
  createdAt: string
}

const nowISO = () => new Date().toISOString()

/** Hitung eksekusi berikutnya setelah `fromMs` — murni, untuk test. */
export function nextRunFor(job: Pick<AgentJob, 'kind' | 'at' | 'intervalMin'>, fromMs: number): number {
  if (job.kind === 'interval') {
    const min = Math.max(1, Math.floor(job.intervalMin ?? 60))
    return fromMs + min * 60_000
  }
  if (job.kind === 'once') {
    const at = job.at ? new Date(job.at) : null
    // once: momen terjadwal; kalau sudah lewat → jangan pura-pura menunggu,
    // eksekusi segera sekali (dipatok ke fromMs) lalu job mati sendiri.
    return at && !isNaN(at.getTime()) ? Math.max(at.getTime(), fromMs) : fromMs
  }
  // daily: jam 'HH:MM' lokal berikutnya
  const [h, m] = (job.at ?? '09:00').split(':').map((n) => parseInt(n, 10))
  const next = new Date(fromMs)
  next.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0)
  if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1)
  return next.getTime()
}

export function describeSchedule(job: Pick<AgentJob, 'kind' | 'at' | 'intervalMin'>): string {
  if (job.kind === 'daily') return `daily at ${job.at ?? '09:00'}`
  if (job.kind === 'once') return `once at ${job.at ?? '(asap)'}`
  return `every ${job.intervalMin ?? 60} min`
}

export async function createJob(input: {
  name: string
  prompt: string
  kind: AgentJobKind
  at?: string
  intervalMin?: number
  enabled?: boolean
}): Promise<AgentJob> {
  if (!input.prompt.trim()) throw new Error('A job needs a prompt.')
  const job: AgentJob = {
    id: uid(),
    name: input.name.trim().slice(0, 120) || input.prompt.trim().slice(0, 60),
    prompt: input.prompt.trim().slice(0, 4000),
    kind: input.kind,
    at: input.at?.trim() || undefined,
    intervalMin: input.kind === 'interval' ? Math.max(1, Math.floor(input.intervalMin ?? 60)) : undefined,
    enabled: input.enabled ?? true,
    nextRunAt: nextRunFor({ kind: input.kind, at: input.at, intervalMin: input.intervalMin }, Date.now()),
    createdAt: nowISO()
  }
  await db.agentJobs.add(job)
  await logActivity('agent.job.created', { detail: `${job.name} · ${describeSchedule(job)}` })
  return job
}

export async function listJobs(): Promise<AgentJob[]> {
  const rows = await db.agentJobs.toArray()
  return rows.sort((a, b) => a.nextRunAt - b.nextRunAt)
}

export async function setJobEnabled(id: string, enabled: boolean): Promise<void> {
  const job = await db.agentJobs.get(id)
  if (!job) return
  const nextRunAt = enabled ? Math.min(job.nextRunAt, nextRunFor(job, Date.now())) : job.nextRunAt
  await db.agentJobs.update(id, { enabled, nextRunAt })
  await logActivity('agent.job.updated', { detail: `${job.name} → ${enabled ? 'enabled' : 'disabled'}` })
}

export async function deleteJob(id: string): Promise<void> {
  const job = await db.agentJobs.get(id)
  await db.agentJobs.delete(id)
  if (job) await logActivity('agent.job.deleted', { detail: job.name })
}

/** Eksekusi manual di luar jadwal — tetap lewat antrean, bukan jalur pintas. */
export async function runJobNow(id: string): Promise<void> {
  const job = await db.agentJobs.get(id)
  if (!job) return
  await db.agentJobs.update(id, { nextRunAt: Date.now() })
  await scheduleDueJobs(Date.now())
}

/** Job yang jatuh tempo → antrean task (idempoten: nextRunAt baru dipasang
 * setelah antrean sukses dibuat; crash di tengah paling banter menggandakan
 * satu eksekusi, tidak pernah menghilangkan kerja). */
export async function scheduleDueJobs(nowMs = Date.now()): Promise<number> {
  // boolean tidak terindeks IndexedDB — filter di memori (tabel kecil)
  const due = (await db.agentJobs.toArray()).filter((j) => j.enabled && j.nextRunAt <= nowMs)
  for (const job of due) {
    const next = nextRunFor(job, nowMs)
    await db.agentJobs.update(job.id, { nextRunAt: job.kind === 'once' ? Number.MAX_SAFE_INTEGER : next })
    await enqueueTask({
      title: `Scheduled: ${job.name}`,
      tool: 'agent.reason',
      args: { prompt: job.prompt, jobId: job.id },
      priority: PRIORITY.scheduledCommitment,
      source: 'schedule'
    })
    await logActivity('agent.job.enqueued', { detail: `${job.name} · ${describeSchedule(job)}` })
  }
  return due.length
}

/** Dipanggil eksekutor task (agent.reason) setelah selesai — simpan hasil. */
export async function markJobRun(id: string, ok: boolean, result?: string): Promise<void> {
  const job = await db.agentJobs.get(id)
  if (!job) return
  await db.agentJobs.update(id, {
    lastRunAt: Date.now(),
    lastStatus: ok ? 'ok' : 'failed',
    lastResult: result?.slice(0, 500),
    enabled: job.kind === 'once' ? false : job.enabled,
    nextRunAt: job.kind === 'once' ? Number.MAX_SAFE_INTEGER : job.nextRunAt
  })
  await logActivity(ok ? 'agent.job.completed' : 'agent.job.failed', {
    detail: `${job.name}${result ? ` — ${result.slice(0, 100)}` : ''}`
  })
}

/** Seberapa lama lagi sampai job berikutnya — buat loop wake tepat waktu. */
export async function msUntilNextJob(nowMs = Date.now()): Promise<number | null> {
  // boolean tidak terindeks IndexedDB — filter di memori (tabel kecil)
  const rows = (await db.agentJobs.toArray()).filter((j) => j.enabled && j.nextRunAt > nowMs)
  return rows.length ? Math.min(...rows.map((j) => j.nextRunAt)) - nowMs : null
}
