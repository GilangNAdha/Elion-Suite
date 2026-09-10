import type { AgentEventRecord } from './activity'
import { db } from './db'
import { PRIORITY, type AgentTask, type Objective } from './agentTasks'
import type { SkillRecord } from './skills'

/**
 * Turunan metrik dashboard Monitoring (§13 spek v4.3) — FUNGSI MURNI.
 * Satu-satunya sumber data: event system + task memory + objectives + ledger.
 * Tidak ada pipeline telemetri paralel, tidak ada angka dari tempat lain.
 *
 * Aturan Part VIII: tiap fungsi mengembalikan `null` (atau array kosong yang
 * ditandai) bila TIDAK ADA event/baris nyata di belakangnya — UI wajib
 * menampilkan "Not enough data yet", bukan nol/placeholder/interpolasi.
 * Sebaliknya: nol DENGAN penyebut nyata (mis. 0% error dari 12 aksi) adalah
 * fakta jujur dan boleh tampil.
 */

// ---------------- Sentient Mode Monitor ----------------

export interface QueueCounts {
  running: number
  paused: number
  completed: number
  interrupted: number
  queued: number
  failed: number
}

export function queueCounts(tasks: AgentTask[]): QueueCounts {
  const c: QueueCounts = { running: 0, paused: 0, completed: 0, interrupted: 0, queued: 0, failed: 0 }
  for (const t of tasks) {
    if (t.status === 'running') c.running++
    else if (t.status === 'paused') c.paused++
    else if (t.status === 'completed') c.completed++
    else if (t.status === 'interrupted') c.interrupted++
    else if (t.status === 'failed') c.failed++
    else if (t.status === 'queued' || t.status === 'resumable') c.queued++
  }
  return c
}

export const TIER_LABELS: Record<number, string> = {
  [PRIORITY.userInstruction]: 'User instruction',
  [PRIORITY.systemSafety]: 'System safety',
  [PRIORITY.urgentObjective]: 'Urgent objective',
  [PRIORITY.scheduledCommitment]: 'Scheduled commitment',
  [PRIORITY.existingTask]: 'Existing task',
  [PRIORITY.autonomousWork]: 'Autonomous work',
  [PRIORITY.optionalOptimization]: 'Optimization'
}

/** Tier prioritas 1–7 yang sedang dikerjakan; null bila antrean kosong. */
export function engagedTier(tasks: AgentTask[]): { tier: number; label: string } | null {
  const live = tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'resumable')
  if (!live.length) return null
  const tier = Math.min(...live.map((t) => t.priority))
  return { tier, label: TIER_LABELS[tier] ?? `Tier ${tier}` }
}

export interface ObjectiveWithActions extends Objective {
  subActions: AgentTask[]
}

export function objectivesWithSubActions(tasks: AgentTask[], objectives: Objective[]): ObjectiveWithActions[] {
  return objectives.map((o) => ({ ...o, subActions: tasks.filter((t) => t.objectiveId === o.id) }))
}

export interface StopResumeEntry {
  at: string
  action: 'started' | 'stopped'
}

export function stopResumeHistory(events: AgentEventRecord[]): StopResumeEntry[] {
  return events
    .filter((e) => e.kind === 'sentient.started' || e.kind === 'sentient.stopped')
    .map((e) => ({ at: e.at, action: e.kind === 'sentient.started' ? ('started' as const) : ('stopped' as const) }))
}

/** Awal sesi sentient terakhir; null bila belum pernah dinyalakan. */
export function lastSessionStart(events: AgentEventRecord[]): string | null {
  const starts = events.filter((e) => e.kind === 'sentient.started')
  return starts.length ? starts[starts.length - 1].at : null
}

// ---------------- Performance ----------------

export interface OutcomeRate {
  completed: number
  failed: number
  rate: number
}

/** Hasil task agent; null bila belum ada SATU PUN outcome tercatat. */
export function taskOutcomes(tasks: AgentTask[]): OutcomeRate | null {
  const completed = tasks.filter((t) => t.status === 'completed').length
  const failed = tasks.filter((t) => t.status === 'failed').length
  if (!completed && !failed) return null
  return { completed, failed, rate: completed / (completed + failed) }
}

/** Rolling success rate kronologis (jendela geser) — garis tren, bukan snapshot. */
export function rollingSuccess(tasks: AgentTask[], window = 5): number[] {
  const outcomes = tasks
    .filter((t) => t.status === 'completed' || t.status === 'failed')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  if (outcomes.length < 2) return []
  const points: number[] = []
  for (let i = 0; i < outcomes.length; i++) {
    const slice = outcomes.slice(Math.max(0, i - window + 1), i + 1)
    points.push(slice.filter((t) => t.status === 'completed').length / slice.length)
  }
  return points
}

export interface LatencyRow {
  category: string
  avgMs: number
  samples: number
}

/** Latensi rata-rata per kategori tool, dari elapsedMs event nyata. */
export function latencyByCategory(events: AgentEventRecord[]): LatencyRow[] {
  const buckets = new Map<string, { total: number; n: number }>()
  for (const e of events) {
    if (e.kind !== 'tool.completed' || typeof e.elapsedMs !== 'number') continue
    const toolId = (e.detail ?? '').split(' — ')[0].trim() || 'unknown'
    const category = toolId.includes('.') ? toolId.split('.')[0] : toolId
    const b = buckets.get(category) ?? { total: 0, n: 0 }
    b.total += e.elapsedMs
    b.n++
    buckets.set(category, b)
  }
  return [...buckets.entries()]
    .map(([category, b]) => ({ category, avgMs: Math.round(b.total / b.n), samples: b.n }))
    .sort((a, b) => b.samples - a.samples)
}

/** Rolling latensi tool kronologis (jendela geser atas elapsedMs nyata). */
export function rollingLatency(events: AgentEventRecord[], window = 5): number[] {
  const samples = events
    .filter((e) => e.kind === 'tool.completed' && typeof e.elapsedMs === 'number')
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => e.elapsedMs as number)
  if (samples.length < 2) return []
  const points: number[] = []
  for (let i = 0; i < samples.length; i++) {
    const slice = samples.slice(Math.max(0, i - window + 1), i + 1)
    points.push(Math.round(slice.reduce((n, v) => n + v, 0) / slice.length))
  }
  return points
}

export interface HourBucket {
  hourISO: string
  count: number
}

/** Aksi per jam — task.completed + task.failed per bucket jam. */
export function hourlyActions(tasks: AgentTask[], hours = 12, nowMs = Date.now()): HourBucket[] {
  const buckets: HourBucket[] = []
  const start = Math.floor(nowMs / 3_600_000) * 3_600_000 - (hours - 1) * 3_600_000
  for (let i = 0; i < hours; i++) {
    const from = start + i * 3_600_000
    const to = from + 3_600_000
    const count = tasks.filter((t) => {
      if (t.status !== 'completed' && t.status !== 'failed') return false
      const at = new Date(t.updatedAt).getTime()
      return at >= from && at < to
    }).length
    buckets.push({ hourISO: new Date(from).toISOString(), count })
  }
  return buckets
}

export interface MemoryOps {
  reads: number
  writes: number
  reinforcements: number
}

/** Operasi memori dari event nyata; null bila tidak ada sama sekali. */
export function memoryOps(events: AgentEventRecord[]): MemoryOps | null {
  let reads = 0
  let writes = 0
  let reinforcements = 0
  for (const e of events) {
    if (e.kind === 'memory.recalled') reads++
    else if (e.kind === 'memory.created' || e.kind === 'memory.updated') writes++
    else if (e.kind === 'memory.reinforced') reinforcements++
  }
  if (!reads && !writes && !reinforcements) return null
  return { reads, writes, reinforcements }
}

export interface ErrorEntry {
  at: string
  text: string
}

/** Error nyata terakhir — tidak pernah disembunyikan supaya terlihat bersih. */
export function recentErrors(events: AgentEventRecord[], limit = 5): ErrorEntry[] {
  return events
    .filter((e) => e.kind === 'task.failed' || e.kind === 'tool.failed')
    .slice(-limit)
    .reverse()
    .map((e) => ({ at: e.at, text: e.detail ?? e.kind }))
}

// ---------------- Growth & Self-Improvement ----------------

export interface HeatCell {
  dateISO: string
  count: number
}

/**
 * Heatmap harian ~90 hari: tiap sel = jumlah event self-improvement NYATA
 * hari itu (skill.promoted + memory.consolidated). Konsolidasi memori ikut
 * dihitung karena itu sinyal belajar terukur yang ada hari ini — UI wajib
 * memberi label jujur, bukan mengklaimnya sebagai skill.
 */
export function growthHeatmap(events: AgentEventRecord[], days = 90, nowMs = Date.now()): HeatCell[] | null {
  const perDay = new Map<string, number>()
  for (const e of events) {
    if (e.kind !== 'skill.promoted' && e.kind !== 'memory.consolidated') continue
    const day = e.at.slice(0, 10)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  if (!perDay.size) return null
  const cells: HeatCell[] = []
  const today = new Date(nowMs).toISOString().slice(0, 10)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(new Date(`${today}T00:00:00Z`).getTime() - i * 86_400_000).toISOString().slice(0, 10)
    cells.push({ dateISO: d, count: perDay.get(d) ?? 0 })
  }
  return cells
}

export interface CurvePoint {
  dateISO: string
  total: number
}

/** Kurva kumulatif jumlah skill dari tanggal createdAt ledger. */
export function skillCurve(skills: SkillRecord[]): CurvePoint[] {
  if (!skills.length) return []
  const sorted = [...skills].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const points: CurvePoint[] = []
  sorted.forEach((s, i) => points.push({ dateISO: s.createdAt.slice(0, 10), total: i + 1 }))
  return points
}

export interface VelocityWeek {
  weekISO: string
  evolve: number
  gepaPr: number
}

/** Skill per minggu, dipisah per sumber — 8 minggu terakhir. */
export function velocityByWeek(skills: SkillRecord[], weeks = 8, nowMs = Date.now()): VelocityWeek[] {
  if (!skills.length) return []
  const dayMs = 86_400_000
  // Awal minggu (Senin) dari minggu berjalan, UTC.
  const now = new Date(nowMs)
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = (monday.getUTCDay() + 6) % 7
  monday.setUTCDate(monday.getUTCDate() - dow)
  const rows: VelocityWeek[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const from = monday.getTime() - w * 7 * dayMs
    const to = from + 7 * dayMs
    const inWeek = skills.filter((s) => {
      const at = new Date(s.createdAt).getTime()
      return at >= from && at < to
    })
    rows.push({
      weekISO: new Date(from).toISOString().slice(0, 10),
      evolve: inWeek.filter((s) => s.origin === 'evolve').length,
      gepaPr: inWeek.filter((s) => s.origin === 'gepa-pr').length
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Performance & improvement (§29–§42) — SEMUA dihitung dari data historis
// nyata (tabel agentTasks + agentEvents). Metric tanpa data = null, UI wajib
// menampilkan "Not enough data yet" — tidak ada angka karangan (§2/§36).
// ---------------------------------------------------------------------------

export interface TaskSuccessWindow {
  completed: number
  failed: number
  /** 0..1 — null kalau tidak ada outcome di jendela ini */
  rate: number | null
  /** rata-rata durasi task completed (ms) — null bila tak ada yang selesai */
  avgDurationMs: number | null
  /** retry rate: task yang pernah gagal-then-retry / total task beroutcome */
  retryRate: number | null
}

function windowStats(tasks: AgentTask[], fromMs: number, toMs: number): TaskSuccessWindow {
  const inWindow = tasks.filter((t) => {
    const at = new Date(t.updatedAt).getTime()
    return at >= fromMs && at < toMs && (t.status === 'completed' || t.status === 'failed')
  })
  const completedRows = inWindow.filter((t) => t.status === 'completed')
  const completed = completedRows.length
  const failed = inWindow.length - completed
  const durations = completedRows
    .map((t) => new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime())
    .filter((d) => d >= 0)
  const retried = inWindow.filter((t) => t.attempts > 1).length
  return {
    completed,
    failed,
    rate: inWindow.length ? completed / inWindow.length : null,
    avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    retryRate: inWindow.length ? retried / inWindow.length : null
  }
}

export interface PerformanceSummary {
  all: TaskSuccessWindow
  recent: TaskSuccessWindow
  previous: TaskSuccessWindow
  /** task selesai tanpa campur tangan user (source != 'user') / semua selesai */
  independentRate: number | null
  autonomy: { user: number; autonomous: number; schedule: number }
  /** perbandingan recent vs previous — null bila salah satu jendela kosong */
  improvement: {
    successDelta: number | null
    durationDeltaMs: number | null
    retryDelta: number | null
  }
}

const DAY = 86_400_000

/** Ringkasan performa dari tabel task agent. `nowMs` injectable untuk test. */
export function performanceSummary(tasks: AgentTask[], nowMs = Date.now()): PerformanceSummary {
  const all = windowStats(tasks, 0, nowMs + DAY)
  const recent = windowStats(tasks, nowMs - 7 * DAY, nowMs)
  const previous = windowStats(tasks, nowMs - 14 * DAY, nowMs - 7 * DAY)
  const done = tasks.filter((t) => t.status === 'completed')
  const independent = done.filter((t) => t.source !== 'user').length
  const autonomy = {
    user: done.filter((t) => t.source === 'user').length,
    autonomous: done.filter((t) => t.source === 'autonomous').length,
    schedule: done.filter((t) => t.source === 'schedule').length
  }
  return {
    all,
    recent,
    previous,
    independentRate: done.length ? independent / done.length : null,
    autonomy,
    improvement: {
      successDelta:
        recent.rate !== null && previous.rate !== null ? recent.rate - previous.rate : null,
      durationDeltaMs:
        recent.avgDurationMs !== null && previous.avgDurationMs !== null
          ? recent.avgDurationMs - previous.avgDurationMs
          : null,
      retryDelta: recent.retryRate !== null && previous.retryRate !== null ? recent.retryRate - previous.retryRate : null
    }
  }
}

export interface ToolReliabilityRow {
  tool: string
  ok: number
  failed: number
  rate: number
  avgMs: number | null
}

/** Keandalan per tool dari event tool.completed/tool.failed (detail = id tool).
 * Hanya tool yang benar-benar pernah dipanggil yang tampil (§37). */
export function toolReliability(events: AgentEventRecord[]): ToolReliabilityRow[] {
  const rows = new Map<string, { ok: number; failed: number; totalMs: number; timed: number }>()
  for (const e of events) {
    if (e.kind !== 'tool.completed' && e.kind !== 'tool.failed') continue
    const tool = (e.detail ?? '').split(' ')[0].split('—')[0].trim()
    if (!tool) continue
    const row = rows.get(tool) ?? { ok: 0, failed: 0, totalMs: 0, timed: 0 }
    if (e.kind === 'tool.completed') row.ok++
    else row.failed++
    if (typeof e.elapsedMs === 'number' && e.elapsedMs >= 0) {
      row.totalMs += e.elapsedMs
      row.timed++
    }
    rows.set(tool, row)
  }
  return [...rows.entries()]
    .map(([tool, r]) => ({
      tool,
      ok: r.ok,
      failed: r.failed,
      rate: r.ok / (r.ok + r.failed),
      avgMs: r.timed ? r.totalMs / r.timed : null
    }))
    .sort((a, b) => b.ok + b.failed - (a.ok + a.failed))
}

export interface AgentHealth {
  runtime: 'on' | 'off'
  memory: 'open' | 'closed'
  toolsAvailable: number
  toolsTotal: number
  scheduler: 'running' | 'idle' | 'off'
  background: 'looping' | 'stopped'
}

/** Health dari state nyata — tidak pernah "Healthy" tanpa dasar (§40). */
export async function agentHealth(enabled: boolean): Promise<Omit<AgentHealth, 'toolsAvailable' | 'toolsTotal'>> {
  let memory: AgentHealth['memory'] = 'closed'
  try {
    memory = db.isOpen() ? 'open' : 'closed'
  } catch {
    memory = 'closed'
  }
  return {
    runtime: enabled ? 'on' : 'off',
    memory,
    scheduler: enabled ? 'running' : 'off',
    background: enabled ? 'looping' : 'stopped'
  }
}

/** Deret mingguan success rate — bahan sparkline §31 (minimal data = []). */
export function weeklySuccess(tasks: AgentTask[], weeks = 6, nowMs = Date.now()): { weekISO: string; rate: number | null }[] {
  const out: { weekISO: string; rate: number | null }[] = []
  const now = new Date(nowMs)
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = (monday.getUTCDay() + 6) % 7
  monday.setUTCDate(monday.getUTCDate() - dow)
  for (let w = weeks - 1; w >= 0; w--) {
    const from = monday.getTime() - w * 7 * DAY
    const slice = tasks.filter((t) => {
      const at = new Date(t.updatedAt).getTime()
      return at >= from && at < from + 7 * DAY && (t.status === 'completed' || t.status === 'failed')
    })
    out.push({
      weekISO: new Date(from).toISOString().slice(0, 10),
      rate: slice.length ? slice.filter((t) => t.status === 'completed').length / slice.length : null
    })
  }
  return out
}
