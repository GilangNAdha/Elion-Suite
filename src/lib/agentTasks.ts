import { db } from './db'
import { uid } from './types'
import { logActivity } from './activity'

/**
 * Task engine runtime (§9, §25, §27, §49, §50, §55) — terpisah dari UI.
 * Task agent TIDAK sama dengan task workspace: task agent = "kerja yang
 * harus dieksekusi Elion" (satu tool + args + antrean prioritas), task
 * workspace = kartu produk. Task agent boleh lahir dari task workspace.
 */

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'interrupted'
  | 'resumable'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Hirarki prioritas §25 — makin kecil makin didahulukan. */
export const PRIORITY = {
  userInstruction: 1,
  systemSafety: 2,
  urgentObjective: 3,
  scheduledCommitment: 4,
  existingTask: 5,
  autonomousWork: 6,
  optionalOptimization: 7
} as const

export interface AgentTask {
  id: string
  title: string
  /** instruksi = satu langkah tool (§55: task multi-stage = beberapa AgentTask
   *  yang dirantai lewat objectiveId; tiap stage persist state-nya) */
  tool: string
  args: Record<string, unknown>
  status: AgentTaskStatus
  priority: number
  objectiveId?: string
  source: 'user' | 'autonomous' | 'schedule'
  attempts: number
  maxAttempts: number
  lastError?: string
  /** epoch ms — gerbang backoff, jangan eksekusi sebelum waktunya */
  nextRetryAt?: number
  createdAt: string
  updatedAt: string
  result?: string
}

export interface Objective {
  id: string
  text: string
  done: boolean
  createdAt: string
}

const nowISO = () => new Date().toISOString()

export async function enqueueTask(input: {
  title: string
  tool: string
  args?: Record<string, unknown>
  priority?: number
  objectiveId?: string
  source?: AgentTask['source']
  maxAttempts?: number
}): Promise<AgentTask> {
  const at = nowISO()
  const task: AgentTask = {
    id: uid(),
    title: input.title.slice(0, 200),
    tool: input.tool,
    args: input.args ?? {},
    status: 'queued',
    priority: input.priority ?? PRIORITY.autonomousWork,
    objectiveId: input.objectiveId,
    source: input.source ?? 'autonomous',
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: at,
    updatedAt: at
  }
  await db.agentTasks.add(task)
  await logActivity('task.created', { taskId: task.id, detail: task.title })
  return task
}

/** Pilih kerja berikutnya: antrean/resumable (backoff sudah lewat), prioritas
 * terkecil, lalu paling tua. Hanya satu task aktif (single-flight, §57). */
export async function pickNext(): Promise<AgentTask | null> {
  const running = await db.agentTasks.where('status').equals('running').count()
  if (running) return null
  const ready = await db.agentTasks
    .where('status')
    .anyOf('queued', 'resumable')
    .filter((t) => !t.nextRetryAt || t.nextRetryAt <= Date.now())
    .toArray()
  if (!ready.length) return null
  ready.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
  return ready[0]
}

export async function markRunning(id: string): Promise<void> {
  await db.agentTasks.update(id, { status: 'running', updatedAt: nowISO() })
  await logActivity('task.started', { taskId: id })
}

export async function completeTask(id: string, result?: string): Promise<void> {
  await db.agentTasks.update(id, { status: 'completed', result, updatedAt: nowISO() })
  await logActivity('task.completed', { taskId: id, detail: result?.slice(0, 160) })
}

/** §49–50: catat error → backoff → RESUMABLE; batas percobaan = FAILED +
 * notifikasi. Tidak pernah retry tanpa batas. */
export async function failTask(id: string, error: string): Promise<void> {
  const t = await db.agentTasks.get(id)
  if (!t) return
  const attempts = t.attempts + 1
  if (attempts >= t.maxAttempts) {
    await db.agentTasks.update(id, { status: 'failed', attempts, lastError: error, updatedAt: nowISO() })
    await logActivity('task.failed', { taskId: id, detail: error.slice(0, 160) })
    const { useNotifyStore } = await import('../stores/notifyStore')
    void useNotifyStore.getState().push({
      kind: 'system',
      title: 'ELION task failed',
      body: `${t.title} — ${error}`.slice(0, 180),
      link: '/settings#runtime'
    })
  } else {
    const delayMs = 30_000 * 2 ** (attempts - 1)
    await db.agentTasks.update(id, {
      status: 'resumable',
      attempts,
      lastError: error,
      nextRetryAt: Date.now() + delayMs,
      updatedAt: nowISO()
    })
    await logActivity('task.retry-scheduled', { taskId: id, detail: `attempt ${attempts + 1} in ${Math.round(delayMs / 1000)}s` })
  }
}

/** Preemption sopan (§26): hanya bisa di batas stage — tool yang sudah jalan
 * dibiarkan selesai, task berikutnya yang ditahan. */
export async function pauseUnstarted(reason: string): Promise<number> {
  const rows = await db.agentTasks.where('status').anyOf('queued', 'resumable').toArray()
  for (const t of rows) await db.agentTasks.update(t.id, { status: 'paused', lastError: reason, updatedAt: nowISO() })
  if (rows.length) await logActivity('task.paused', { detail: `${rows.length} × (${reason})` })
  return rows.length
}

export async function resumePaused(): Promise<number> {
  const rows = await db.agentTasks.where('status').equals('paused').toArray()
  for (const t of rows) await db.agentTasks.update(t.id, { status: 'queued', updatedAt: nowISO() })
  if (rows.length) await logActivity('task.resumed', { detail: `${rows.length} queued back` })
  return rows.length
}

export async function cancelTask(id: string): Promise<void> {
  await db.agentTasks.update(id, { status: 'cancelled', updatedAt: nowISO() })
  await logActivity('task.cancelled', { taskId: id })
}

/** Crash recovery (§32): task 'running' dari sesi lama = tak ada yang
 * mengeksekusi → kembalikan ke antrean, state tidak hilang. */
export async function recoverStaleTasks(): Promise<number> {
  const stale = await db.agentTasks.where('status').equals('running').toArray()
  for (const t of stale)
    await db.agentTasks.update(t.id, { status: 'queued', lastError: 'recovered after restart', updatedAt: nowISO() })
  if (stale.length) await logActivity('task.recovered', { detail: `×${stale.length}` })
  return stale.length
}

/** Untuk monitor/UI: daftar task terbaru. */
export async function listTasks(limit = 12): Promise<AgentTask[]> {
  const rows = await db.agentTasks.toArray()
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
}

// ---------------- Objectives (§28) ----------------

export async function addObjective(text: string): Promise<Objective> {
  const o: Objective = { id: uid(), text: text.slice(0, 300), done: false, createdAt: nowISO() }
  await db.objectives.add(o)
  return o
}

export async function listObjectives(): Promise<Objective[]> {
  return (await db.objectives.toArray()).sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt))
}

export async function setObjectiveDone(id: string, done: boolean): Promise<void> {
  await db.objectives.update(id, { done })
}
