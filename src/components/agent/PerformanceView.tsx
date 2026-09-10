import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useActivityFeed } from '../../lib/activity'
import { listTasks } from '../../lib/agentTasks'
import { listTools } from '../../lib/tools'
import {
  performanceSummary,
  rollingSuccess,
  toolReliability,
  weeklySuccess,
  type PerformanceSummary as Perf,
  type ToolReliabilityRow
} from '../../lib/monitoring'
import { timeAgo } from '../../lib/time'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { msUntilNextJob } from '../../lib/agentJobs'

/**
 * Performance (§29–§42): apakah ELION benar-benar makin efektif — dihitung
 * dari histori nyata. Metric tanpa data tampil "Not enough data yet".
 * TIDAK ada "intelligence score" (§36) — hanya outcome terukur.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`
const dur = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

function NotEnough() {
  return <p className="agent-empty">Not enough data yet — this appears once Elion has real recorded work.</p>
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="perf-metric">
      <span className="perf-value">{value}</span>
      <span className="perf-label">{label}</span>
      {sub && <span className="perf-sub">{sub}</span>}
    </div>
  )
}

/** Sparkline SVG minimal (§31) — stroke dari token via CSS, tanpa dekorasi. */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 220
  const h = 44
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="perf-spark" role="img" aria-label="Success rate trend">
      <path d={d} fill="none" strokeWidth="1.5" />
    </svg>
  )
}

export function PerformanceView() {
  const events = useActivityFeed((s) => s.events)
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof listTasks>>>([])
  const [tools, setTools] = useState<{ total: number; available: number } | null>(null)
  const [memoryOpen, setMemoryOpen] = useState<boolean | null>(null)
  const [range, setRange] = useState<'7' | '30' | 'all'>('30')

  useEffect(() => {
    void (async () => {
      setTasks(await listTasks(500))
      const registry = listTools()
      let available = 0
      for (const t of registry) {
        try {
          if ((await t.available?.()) ?? true) available++
        } catch {
          /* availability check gagal = tidak tersedia, jujur */
        }
      }
      setTools({ total: registry.length, available })
      setMemoryOpen(db.isOpen())
    })()
  }, [])

  const nowMs = Date.now()
  const windowDays = range === 'all' ? 3650 : Number(range)
  const windowTasks = range === 'all' ? tasks : tasks.filter((t) => nowMs - new Date(t.updatedAt).getTime() < windowDays * 86_400_000)
  const perf: Perf = performanceSummary(windowTasks, nowMs)
  const toolRows: ToolReliabilityRow[] = toolReliability(events)
  const successPoints = rollingSuccess(windowTasks, 5)
  const weekly = weeklySuccess(windowTasks, 6, nowMs)

  return (
    <div className="perf-view" aria-label="ELION performance">
      <header className="mon-sec-head">
        <h2>ELION performance</h2>
        <div className="mon-filters" role="group" aria-label="Time range">
          {(['7', '30', 'all'] as const).map((r) => (
            <button key={r} type="button" className={`mon-filter ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>
              {r === 'all' ? 'All time' : `${r} days`}
            </button>
          ))}
        </div>
      </header>

      {perf.all.rate === null ? (
        <NotEnough />
      ) : (
        <>
          <div className="perf-grid">
            <Metric label="Task success" value={pct(perf.all.rate ?? 0)} sub={`${perf.all.completed} completed · ${perf.all.failed} failed`} />
            <Metric
              label="Avg completion"
              value={perf.all.avgDurationMs !== null ? dur(perf.all.avgDurationMs) : '—'}
              sub={perf.improvement.durationDeltaMs !== null ? `${perf.improvement.durationDeltaMs <= 0 ? '−' : '+'}${dur(Math.abs(perf.improvement.durationDeltaMs))} vs previous week` : undefined}
            />
            <Metric
              label="Independent completion"
              value={perf.independentRate !== null ? pct(perf.independentRate) : '—'}
              sub={`${perf.autonomy.autonomous} autonomous · ${perf.autonomy.schedule} scheduled · ${perf.autonomy.user} user-requested`}
            />
            <Metric
              label="Retry rate"
              value={perf.all.retryRate !== null ? pct(perf.all.retryRate) : '—'}
              sub={perf.improvement.retryDelta !== null ? `${perf.improvement.retryDelta <= 0 ? '−' : '+'}${pct(Math.abs(perf.improvement.retryDelta))} vs previous week` : undefined}
            />
          </div>

          {(successPoints.length >= 2 || weekly.some((w) => w.rate !== null)) && (
            <section className="perf-trend" aria-label="Success trend">
              <h3>Success over time</h3>
              <Spark points={successPoints.length >= 2 ? successPoints : weekly.map((w) => w.rate ?? 0)} />
              <p className="mon-note">Rolling success across the selected range — computed from recorded task outcomes.</p>
            </section>
          )}
        </>
      )}

      <section className="perf-tools" aria-label="Tool reliability">
        <h3>Tool reliability</h3>
        {!toolRows.length ? (
          <NotEnough />
        ) : (
          <ul>
            {toolRows.slice(0, 6).map((r) => (
              <li key={r.tool}>
                <code>{r.tool}</code>
                <span className="perf-bar" aria-hidden>
                  <i style={{ width: `${Math.round(r.rate * 100)}%` }} />
                </span>
                <em>
                  {pct(r.rate)} · {r.ok + r.failed} call{r.ok + r.failed === 1 ? '' : 's'}
                  {r.avgMs !== null ? ` · ~${r.avgMs < 1000 ? `${Math.round(r.avgMs)}ms` : `${(r.avgMs / 1000).toFixed(1)}s`}` : ''}
                </em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="perf-health" aria-label="Agent health">
        <h3>Agent health</h3>
        <ul>
          <li>
            <span>Runtime</span> <em>{useRuntimeLabel()}</em>
          </li>
          <li>
            <span>Memory store</span> <em>{memoryOpen === null ? '…' : memoryOpen ? 'open (IndexedDB)' : 'closed'}</em>
          </li>
          <li>
            <span>Tools</span>{' '}
            <em>
              {tools ? `${tools.available} / ${tools.total} available` : '…'}
            </em>
          </li>
          <li>
            <span>Scheduler</span> <em>{useSchedulerLabel()}</em>
          </li>
        </ul>
        <p className="mon-note">Last event recorded {events.length ? timeAgo(events[events.length - 1].at) : '— never'}.</p>
      </section>
    </div>
  )
}

function useRuntimeLabel(): string {
  const enabled = useRuntimeStore((s) => s.enabled)
  return enabled ? 'running' : 'off'
}

function useSchedulerLabel(): string {
  const enabled = useRuntimeStore((s) => s.enabled)
  const [next, setNext] = useState<number | null>(null)
  useEffect(() => {
    void msUntilNextJob().then(setNext).catch(() => undefined)
  }, [])
  if (!enabled) return 'off'
  return next !== null ? `running · next job in ${Math.max(1, Math.round(next / 60_000))}m` : 'running · no jobs scheduled'
}
