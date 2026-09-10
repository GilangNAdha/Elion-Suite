import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useActivityFeed } from '../../lib/activity'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { listSkills } from '../../lib/skills'
import { listTools } from '../../lib/tools'
import { msUntilNextJob } from '../../lib/agentJobs'
import {
  avgToolLatency,
  eventHeatmap,
  eventsInLastHours,
  growthHeatmap,
  hourlyActions,
  latencyByCategory,
  memoryOps,
  performanceSummary,
  queueCounts,
  recentErrors,
  rollingLatency,
  rollingSuccess,
  toolReliability
} from '../../lib/monitoring'
import { agentStateLabel, useMonitorData } from './Monitor'
import { ActivityHeatmap, CatBars, HourBars, StatTile, TrendLine, formatMs } from './charts'
import { timeAgo } from '../../lib/time'

/**
 * Monitoring ELION (Master Prompt §29–§42 + gaya Task Manager): semua metrik
 * "AI" dihitung dari data historis nyata (agentTasks + agentEvents). Metrik
 * tanpa data tampil "Not enough data yet" — tidak ada angka karangan, tidak
 * ada "intelligence score".
 */

const pctLabel = (v: number) => `${Math.round(v * 100)}%`

function NotEnough({ what }: { what: string }) {
  return <p className="agent-empty">Not enough data yet — {what} appears once Elion has real recorded work.</p>
}

export function MonitoringDashboard() {
  const data = useMonitorData()
  const events = useActivityFeed((s) => s.events)
  const runtime = useRuntimeStore()
  const state = agentStateLabel(runtime.enabled, runtime.phase, runtime.activeTask)
  const [tools, setTools] = useState<{ total: number; available: number } | null>(null)
  const [memoryOpen, setMemoryOpen] = useState<boolean | null>(null)
  const [skills, setSkills] = useState<number | null>(null)
  const [range, setRange] = useState<'7' | '30' | 'all'>('30')

  useEffect(() => {
    void (async () => {
      setSkills((await listSkills()).length)
      const registry = listTools()
      let available = 0
      for (const t of registry) {
        try {
          if ((await t.available?.()) ?? true) available++
        } catch {
          /* availability check gagal = jujur, dihitung tidak tersedia */
        }
      }
      setTools({ total: registry.length, available })
      setMemoryOpen(db.isOpen())
    })()
  }, [])

  const nowMs = Date.now()
  const queue = queueCounts(data.tasks)
  const windowTasks = range === 'all' ? data.tasks : data.tasks.filter((t) => nowMs - new Date(t.updatedAt).getTime() < Number(range) * 86_400_000)
  const perf = performanceSummary(windowTasks, nowMs)
  const lat = avgToolLatency(events)
  const latencyRows = latencyByCategory(events)
  const toolRows = toolReliability(events)
  const errors = recentErrors(events, 5)
  const memOps = memoryOps(events)
  const growth = growthHeatmap(events, 90, nowMs)
  const heat = eventHeatmap(events, 84, nowMs)
  const successPoints = rollingSuccess(windowTasks, 5)
  const latencyPoints = rollingLatency(events, 5)
  const rate = perf.recent.rate ?? perf.all.rate
  const lastEvent = events.length ? events[events.length - 1] : null

  return (
    <div className="mon-dash" aria-label="ELION monitoring">
      <header className="mon-sec-head">
        <h2>Monitoring</h2>
        <div className="mon-filters" role="group" aria-label="Performance range">
          {(['7', '30', 'all'] as const).map((r) => (
            <button key={r} type="button" className={`mon-filter ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>
              {r === 'all' ? 'All time' : `${r} days`}
            </button>
          ))}
        </div>
      </header>

      {/* ——— tiles: kondisi AI saat ini ——— */}
      <div className="stat-row">
        <StatTile
          label="Runtime"
          value={runtime.enabled ? 'On' : 'Off'}
          sub={runtime.enabled ? state.label : 'Sentient Mode off'}
          tone={runtime.enabled ? 'ok' : 'bad'}
        />
        <StatTile
          label="Tasks active"
          value={String(queue.running + queue.queued)}
          sub={`${queue.running} running · ${queue.queued} queued · ${queue.paused + queue.interrupted} paused`}
          tone={queue.running ? 'info' : undefined}
        />
        <StatTile
          label="Success rate"
          value={rate !== null ? pctLabel(rate) : '—'}
          sub={
            perf.improvement.successDelta !== null
              ? `${perf.improvement.successDelta >= 0 ? '▲' : '▼'} ${pctLabel(Math.abs(perf.improvement.successDelta))} vs previous week`
              : `${perf.all.completed} completed · ${perf.all.failed} failed`
          }
          tone={rate !== null ? (rate >= 0.8 ? 'ok' : rate >= 0.5 ? 'warn' : 'bad') : undefined}
        />
        <StatTile
          label="Avg tool latency"
          value={lat ? formatMs(lat.avgMs) : '—'}
          sub={lat ? `${lat.samples} timed call${lat.samples === 1 ? '' : 's'}` : 'no timed tool calls yet'}
        />
        <StatTile
          label="Events this hour"
          value={String(eventsInLastHours(events, 1, nowMs))}
          sub={lastEvent ? `last: ${timeAgo(lastEvent.at)}` : 'no events recorded yet'}
          tone={events.length ? 'accent' : undefined}
        />
      </div>

      {/* ——— aktivitas per jam + tren latensi ——— */}
      <section className="mon-panel" aria-label="AI activity">
        <h3>AI activity — tasks finished per hour</h3>
        <HourBars buckets={hourlyActions(data.tasks, 24, nowMs)} caption="Tasks finished per hour, last 24 hours" />
      </section>

      <section className="mon-panel" aria-label="AI activity heatmap">
        <h3>AI activity heatmap — events per day</h3>
        <ActivityHeatmap cells={heat} />
        <p className="mon-note">Every recorded agent event, one cell per day. Real records only — nothing estimated.</p>
      </section>

      {(successPoints.length >= 2 || perf.all.rate !== null) && (
        <section className="mon-panel" aria-label="Success trend">
          <h3>Success over time</h3>
          {successPoints.length >= 2 ? (
            <TrendLine points={successPoints} label="Rolling task success rate" />
          ) : (
            <NotEnough what="a trend line" />
          )}
        </section>
      )}

      <section className="mon-panel" aria-label="Latency">
        <h3>Latency</h3>
        {latencyPoints.length >= 2 ? (
          <TrendLine points={latencyPoints} format={formatMs} label="Rolling tool latency" />
        ) : (
          <NotEnough what="a latency line" />
        )}
        {latencyRows.length ? (
          <>
            <h3 className="mon-sub">Average latency per tool category</h3>
            <CatBars rows={latencyRows.slice(0, 6)} />
          </>
        ) : null}
      </section>

      <section className="mon-panel" aria-label="Tool reliability">
        <h3>Tool reliability</h3>
        {toolRows.length ? (
          <ul className="tool-table">
            {toolRows.slice(0, 8).map((r) => (
              <li key={r.tool}>
                <code>{r.tool}</code>
                <span className="perf-bar" aria-hidden>
                  <i style={{ width: `${Math.round(r.rate * 100)}%` }} data-low={r.rate < 0.7} />
                </span>
                <em>
                  {pctLabel(r.rate)} · {r.ok + r.failed} call{r.ok + r.failed === 1 ? '' : 's'}
                  {r.avgMs !== null ? ` · ~${formatMs(r.avgMs)}` : ''}
                </em>
              </li>
            ))}
          </ul>
        ) : (
          <NotEnough what="tool stats" />
        )}
      </section>

      <section className="mon-panel" aria-label="Errors">
        <h3>Recent errors</h3>
        {errors.length ? (
          <ul className="err-list">
            {errors.map((e, i) => (
              <li key={i}>
                <span aria-hidden>×</span>
                <p>{e.text}</p>
                <time>{timeAgo(e.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="agent-empty">No recorded errors — this section only lists real failures.</p>
        )}
      </section>

      <div className="mon-duo">
        <section className="mon-panel" aria-label="Agent health">
          <h3>Agent health</h3>
          <ul className="health-list">
            <li>
              <span>Runtime</span> <em>{runtime.enabled ? 'running' : 'off'}</em>
            </li>
            <li>
              <span>Memory store</span> <em>{memoryOpen === null ? '…' : memoryOpen ? 'open (IndexedDB)' : 'closed'}</em>
            </li>
            <li>
              <span>Tools</span> <em>{tools ? `${tools.available} / ${tools.total} available` : '…'}</em>
            </li>
            <li>
              <span>Scheduler</span> <em>{data.nextJobMs !== null ? `next job in ${Math.max(1, Math.round(data.nextJobMs / 60_000))}m` : 'no jobs scheduled'}</em>
            </li>
            <li>
              <span>Last event</span> <em>{lastEvent ? timeAgo(lastEvent.at) : 'never'}</em>
            </li>
          </ul>
        </section>

        <section className="mon-panel" aria-label="Memory and learning">
          <h3>Memory &amp; learning</h3>
          {memOps ? (
            <div className="mem-ops">
              <div>
                <strong>{memOps.reads}</strong>
                <span>recalls</span>
              </div>
              <div>
                <strong>{memOps.writes}</strong>
                <span>writes</span>
              </div>
              <div>
                <strong>{memOps.reinforcements}</strong>
                <span>reinforcements</span>
              </div>
            </div>
          ) : (
            <p className="agent-empty">No memory operations recorded yet.</p>
          )}
          <p className="mon-note">
            {skills !== null ? `${skills} skill${skills === 1 ? '' : 's'} in the ledger.` : ''}
            {growth ? ` Learning activity recorded on ${growth.filter((c) => c.count > 0).length} of the last 90 days.` : ''}
          </p>
        </section>
      </div>
    </div>
  )
}
