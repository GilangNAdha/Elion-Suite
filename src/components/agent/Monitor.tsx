import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { useActivityFeed, type AgentEventRecord } from '../../lib/activity'
import { listTasks, type AgentTask } from '../../lib/agentTasks'
import { describeSchedule, listJobs, msUntilNextJob } from '../../lib/agentJobs'
import { listObjectives, type Objective } from '../../lib/agentTasks'
import { Button } from '../ui'
import { timeAgo } from '../../lib/time'

/**
 * Monitor utama (§11–§26, §60): apa yang ELION kerjakan SEKARANG, kenapa
 * (sumber/objektif), apa berikutnya, timeline hidup, dan antrean task.
 * Semua nilai dibaca dari state runtime nyata — tidak ada progres karangan.
 */

export interface MonitorData {
  tasks: AgentTask[]
  objectives: Objective[]
  jobs: { name: string; schedule: string }[]
  nextJobMs: number | null
  lastEventAt: string | null
}

export function useMonitorData(): MonitorData {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [jobs, setJobs] = useState<{ name: string; schedule: string }[]>([])
  const [nextJobMs, setNextJobMs] = useState<number | null>(null)
  const events = useActivityFeed((s) => s.events)

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const t = await listTasks(200)
      const o = await listObjectives()
      const j = await listJobs()
      const ms = await msUntilNextJob()
      if (!alive) return
      setTasks(t)
      setObjectives(o)
      setJobs(j.filter((x) => x.enabled).map((x) => ({ name: x.name, schedule: describeSchedule(x) })))
      setNextJobMs(ms)
    }
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return { tasks, objectives, jobs, nextJobMs, lastEventAt: events.length ? events[events.length - 1].at : null }
}

export function agentStateLabel(enabled: boolean, phase: string, activeTask: string | null): { label: string; cls: string } {
  if (!enabled) return { label: 'Idle', cls: 'is-idle' }
  if (phase === 'acting' && activeTask) return { label: 'Working', cls: 'is-work' }
  if (phase === 'acting') return { label: 'Working', cls: 'is-work' }
  if (phase === 'observing') return { label: 'Observing', cls: 'is-observe' }
  if (phase === 'blocked-by-user') return { label: 'Paused for you', cls: 'is-paused' }
  return { label: 'Autonomous', cls: 'is-auto' }
}

const SOURCE_WHY: Record<string, string> = {
  user: 'User request — always first priority',
  schedule: 'Scheduled commitment',
  autonomous: 'Autonomous work toward the active objective'
}

/** Detik berjalan task aktif — interval lokal, data tetap dari runtime. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const started = new Date(since).getTime()
  if (isNaN(started)) return null
  const s = Math.max(0, Math.floor((now - started) / 1000))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return (
    <span className="mon-elapsed">
      Started {timeAgo(since)} · elapsed {mm > 0 ? `${mm}m ` : ''}
      {ss}s
    </span>
  )
}

export function CurrentActivity({ data }: { data: MonitorData }) {
  const runtime = useRuntimeStore()
  const running = data.tasks.filter((t) => t.status === 'running')
  const active = running[0] ?? null
  const state = agentStateLabel(runtime.enabled, runtime.phase, runtime.activeTask)
  const queued = useMemo(
    () =>
      data.tasks
        .filter((t) => (t.status === 'queued' || t.status === 'resumable') && (!t.nextRetryAt || t.nextRetryAt <= Date.now()))
        .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)),
    [data.tasks]
  )
  const openObjectives = data.objectives.filter((o) => !o.done)
  const nextJob = data.jobs.length
    ? data.jobs.reduce((best, j) => (j.schedule < best.schedule ? j : best), data.jobs[0])
    : null

  if (!runtime.enabled) {
    return (
      <section className="mon-current is-off" aria-label="Current activity">
        <header className="mon-current-head">
          <span className={`agent-dot ${state.cls}`} aria-hidden />
          <h2>Current activity</h2>
          <span className="mon-state">Sentient Mode is off</span>
        </header>
        <p className="mon-current-title">Not running — Elion only works while Sentient Mode is on.</p>
        <div className="mon-next-row">
          <Button size="sm" variant="primary" onClick={() => runtime.setEnabled(true)}>
            Start Sentient Mode
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mon-current" aria-label="Current activity">
      <header className="mon-current-head">
        <span className={`agent-dot ${state.cls}`} aria-hidden />
        <h2>Current activity</h2>
        <span className={`mon-state ${state.cls}`}>● {state.label}</span>
      </header>

      {active ? (
        <>
          <p className="mon-current-title">{active.title}</p>
          <p className="mon-why">
            <strong>Why</strong> {SOURCE_WHY[active.source] ?? active.source}
          </p>
          <p className="mon-meta">
            <code>{active.tool}</code>
            {active.attempts > 1 && <span>attempt {active.attempts}/{active.maxAttempts}</span>}
          </p>
          <Elapsed since={active.updatedAt} />
        </>
      ) : runtime.phase === 'blocked-by-user' ? (
        <>
          <p className="mon-current-title">Paused — your instruction has priority</p>
          <p className="mon-why">
            <strong>Why</strong> Explicit user input always outranks autonomous work; the queue resumes after.
          </p>
        </>
      ) : runtime.busy ? (
        <>
          <p className="mon-current-title">{runtime.activeTask ?? 'Working…'}</p>
          {runtime.lastOutcome && <p className="mon-meta">last: {runtime.lastOutcome}</p>}
        </>
      ) : (
        <>
          <p className="mon-current-title">No useful authorized work available.</p>
          <p className="mon-why">
            <strong>Idle is honest</strong> — the loop stays quiet until real work exists.
          </p>
        </>
      )}

      <div className="mon-next-row">
        <p>
          <strong>NEXT</strong>{' '}
          {queued[0] ? (
            queued[0].title
          ) : nextJob ? (
            <>Next scheduled: {nextJob.name} ({nextJob.schedule})</>
          ) : (
            'Evaluating available work…'
          )}
        </p>
      </div>

      {openObjectives.length > 0 && (
        <div className="mon-objective">
          <h3>Objective — why Elion works</h3>
          <ul>
            {openObjectives.slice(0, 3).map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live activity timeline (§16–§22, §42–§46)
// ---------------------------------------------------------------------------

type EventState = 'ok' | 'run' | 'fail' | 'mem' | 'wait' | 'info'

function eventState(kind: string): EventState {
  if (kind.endsWith('.completed') || kind === 'permission.granted' || kind === 'task.resumed') return 'ok'
  if (kind.endsWith('.started') || kind.endsWith('.enqueued')) return 'run'
  if (kind.endsWith('.failed') || kind === 'permission.denied' || kind === 'task.recovered') return 'fail'
  if (kind.startsWith('memory.')) return 'mem'
  if (kind === 'permission.requested' || kind === 'task.retry-scheduled' || kind === 'task.paused') return 'wait'
  return 'info'
}

const STATE_GLYPH: Record<EventState, string> = {
  ok: '✓',
  run: '●',
  fail: '×',
  mem: '◇',
  wait: 'Ⅱ',
  info: '·'
}

const FILTERS: { id: string; label: string; match: (k: string, st: EventState) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'tasks', label: 'Tasks', match: (k) => k.startsWith('task.') || k.startsWith('agent.skill') },
  { id: 'tools', label: 'Tools', match: (k) => k.startsWith('tool.') },
  { id: 'schedule', label: 'Schedule', match: (k) => k.startsWith('agent.job') || k.startsWith('schedule.') },
  { id: 'memory', label: 'Memory', match: (k) => k.startsWith('memory.') },
  { id: 'system', label: 'System', match: (k) => k.startsWith('sentient.') || k.startsWith('permission.') || k.startsWith('objective.') || k.startsWith('notification.') },
  { id: 'errors', label: 'Errors', match: (_k, st) => st === 'fail' }
]

interface TimelineRow {
  key: string
  at: string
  kind: string
  detail?: string
  state: EventState
  count: number
}

/** §18: kejadian beruntun sesama kind dilebur jadi satu baris berhitung —
 * tetap event asli, hanya ringkas. */
function groupRows(events: AgentEventRecord[]): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const e of events) {
    const state = eventState(e.kind)
    const last = rows[rows.length - 1]
    if (last && last.kind === e.kind) {
      last.count += 1
      last.at = e.at
      last.detail = e.detail ?? last.detail
      continue
    }
    rows.push({ key: e.id, at: e.at, kind: e.kind, detail: e.detail, state, count: 1 })
  }
  return rows
}

export function LiveActivity({ compact = false }: { compact?: boolean }) {
  const events = useActivityFeed((s) => s.events)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]
    const q = query.trim().toLowerCase()
    const list = [...events]
      .reverse()
      .filter((e) => f.match(e.kind, eventState(e.kind)))
      .filter((e) => !q || `${e.kind} ${e.detail ?? ''}`.toLowerCase().includes(q))
    return groupRows(list).slice(0, compact ? 8 : 60)
  }, [events, filter, query, compact])

  const hiddenNew = Math.max(0, events.filter((e) => f_match(filter, query, e)).length - (compact ? 8 : 60))

  return (
    <section className="mon-live" aria-label="Live activity">
      <header className="mon-live-head">
        <h2>Live activity</h2>
        <span className="mon-live-dot" aria-hidden title="Reading the real event stream" />
      </header>
      <div className="mon-filters" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`mon-filter ${filter === f.id ? 'is-active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <input
        className="mon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search ELION activity…"
        aria-label="Search ELION activity"
      />
      {!filtered.length ? (
        <p className="agent-empty">No events yet — they appear here as Elion actually works.</p>
      ) : (
        <ol className="mon-timeline">
          {filtered.map((r) => (
            <li key={r.key} data-state={r.state}>
              <time>{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              <span className="mon-glyph" aria-hidden>
                {STATE_GLYPH[r.state]}
              </span>
              <div className="mon-row-body">
                <code>{r.kind}</code>
                {r.count > 1 && <em className="mon-count">×{r.count}</em>}
                {r.detail && <p>{r.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {hiddenNew > 0 && (
        <p className="mon-note">{hiddenNew} older events outside this view — widen the filter or clear the search.</p>
      )}
    </section>
  )
}

function f_match(filterId: string, query: string, e: AgentEventRecord): boolean {
  const f = FILTERS.find((x) => x.id === filterId) ?? FILTERS[0]
  const q = query.trim().toLowerCase()
  return f.match(e.kind, eventState(e.kind)) && (!q || `${e.kind} ${e.detail ?? ''}`.toLowerCase().includes(q))
}

// ---------------------------------------------------------------------------
// Active tasks + background summary (§23–§26)
// ---------------------------------------------------------------------------

const TASK_STATE: Record<string, { glyph: string; label: string }> = {
  running: { glyph: '●', label: 'Running' },
  queued: { glyph: '○', label: 'Queued' },
  paused: { glyph: 'Ⅱ', label: 'Paused' },
  resumable: { glyph: '↻', label: 'Retry scheduled' },
  interrupted: { glyph: 'Ⅱ', label: 'Interrupted' },
  completed: { glyph: '✓', label: 'Completed' },
  failed: { glyph: '×', label: 'Failed' },
  cancelled: { glyph: '—', label: 'Cancelled' }
}

const SOURCE_TAG: Record<string, string> = {
  user: 'USER REQUEST',
  autonomous: 'AUTONOMOUS',
  schedule: 'SCHEDULED'
}

export function ActiveTasks({ data }: { data: MonitorData }) {
  const activeStates = ['running', 'queued', 'paused', 'resumable', 'interrupted']
  const active = data.tasks.filter((t) => activeStates.includes(t.status))
  const doneToday = data.tasks.filter((t) => t.status === 'completed' && Date.now() - new Date(t.updatedAt).getTime() < 86_400_000)
  const paused = active.filter((t) => t.status === 'paused' || t.status === 'interrupted').length

  return (
    <section className="mon-tasks" aria-label="Active tasks">
      <header className="mon-sec-head">
        <h2>Active tasks</h2>
        <span className="mon-bg-count">
          Background: {active.filter((t) => t.status === 'running').length} running · {paused} paused · {doneToday.length} completed today
        </span>
      </header>
      {!active.length ? (
        <p className="agent-empty">Nothing in the queue — autonomous work lands here when the loop creates it.</p>
      ) : (
        <ul>
          {active.slice(0, 8).map((t) => (
            <li key={t.id} data-status={t.status}>
              <span className="mon-task-glyph" aria-hidden>
                {TASK_STATE[t.status]?.glyph ?? '○'}
              </span>
              <span className="mon-task-title" title={t.lastError ?? t.title}>
                {t.title}
              </span>
              <em className={`mon-src is-${t.source}`}>{SOURCE_TAG[t.source] ?? t.source}</em>
              <span className="mon-task-state">{TASK_STATE[t.status]?.label ?? t.status}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mon-note">
        Your instructions always preempt autonomous work — autonomous tasks pause and resume around them (§25–§26).
        Full control in <Link to="/settings#runtime">Settings › ELION runtime</Link>.
      </p>
    </section>
  )
}
