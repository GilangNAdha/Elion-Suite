import { useEffect, useState } from 'react'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { PERMISSIONS, effectiveMode, usePermissionStore } from '../../lib/permissions'
import { useActivityFeed } from '../../lib/activity'
import { listObjectives, listTasks, type AgentTask, type Objective } from '../../lib/agentTasks'
import { listSkills, SKILL_ORIGIN_LABEL, type SkillRecord } from '../../lib/skills'
import {
  engagedTier,
  growthHeatmap,
  hourlyActions,
  lastSessionStart,
  latencyByCategory,
  memoryOps,
  objectivesWithSubActions,
  queueCounts,
  recentErrors,
  rollingLatency,
  rollingSuccess,
  skillCurve,
  stopResumeHistory,
  taskOutcomes,
  velocityByWeek
} from '../../lib/monitoring'
import { minutesLabel, timeAgo } from '../../lib/time'

/**
 * Dashboard Monitoring (§13 spek v4.3) — perluasan panel Sentient, BUKAN
 * panel kedua yang menghitung sendiri. SEMUA angka dibaca dari sumber yang
 * sama: event system + task memory + objectives + Skill Ledger.
 * Tiap metrik tanpa data nyata menampilkan "Not enough data yet".
 */
export function MonitoringDashboard() {
  const runtime = useRuntimeStore()
  const feed = useActivityFeed()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  void usePermissionStore((s) => s.modes) // re-render saat permission berubah

  useEffect(() => {
    const refresh = async () => {
      setTasks(await listTasks(1000))
      setObjectives(await listObjectives())
      setSkills(await listSkills())
      setNowMs(Date.now())
    }
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [])

  const events = feed.events
  const counts = queueCounts(tasks)
  const tier = engagedTier(tasks)
  const outcomes = taskOutcomes(tasks)
  const latencies = latencyByCategory(events)
  const hours = hourlyActions(tasks, 12, nowMs)
  const hoursHaveData = hours.some((h) => h.count > 0)
  const memops = memoryOps(events)
  const errors = recentErrors(events)
  const history = stopResumeHistory(events)
  const sessionStart = lastSessionStart(events)
  const heat = growthHeatmap(events, 90, nowMs)
  const curve = skillCurve(skills)
  const velocity = velocityByWeek(skills, 8, nowMs)
  const successTrend = rollingSuccess(tasks)
  const latencyTrend = rollingLatency(events)
  const withActions = objectivesWithSubActions(tasks, objectives)

  return (
    <div className="monitor">
      <h3 className="monitor-title">Monitoring</h3>

      {/* ── Panel 1: Sentient Mode Monitor ── */}
      <section className="monitor-panel" aria-label="Sentient Mode monitor">
        <h4>Sentient Mode</h4>
        <dl className="monitor-grid">
          <div>
            <dt>Session uptime</dt>
            <dd>
              {!runtime.enabled ? (
                'Sentient Mode is off'
              ) : sessionStart ? (
                minutesLabel(nowMs - new Date(sessionStart).getTime())
              ) : (
                <NoData />
              )}
            </dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>
              {counts.running} running · {counts.queued} queued · {counts.paused} paused ·{' '}
              {counts.interrupted} interrupted · {counts.completed} completed · {counts.failed} failed
            </dd>
          </div>
          <div>
            <dt>Priority tier engaged</dt>
            <dd>{tier ? `Tier ${tier.tier} — ${tier.label}` : 'No active work'}</dd>
          </div>
        </dl>
        <div className="monitor-sub">
          <h5>Objectives + spawned sub-actions</h5>
          {withActions.length === 0 && <NoData />}
          <ul>
            {withActions.map((o) => (
              <li key={o.id}>
                <span className={o.done ? 'is-done' : ''}>{o.text}</span>
                {o.subActions.length > 0 && (
                  <small>
                    {' '}
                    → {o.subActions.filter((t) => t.status === 'completed').length}/
                    {o.subActions.length} sub-actions done
                  </small>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="monitor-sub">
          <h5>Active permissions</h5>
          <ul className="monitor-perms">
            {PERMISSIONS.map((p) => {
              const mode = effectiveMode(p.key)
              return (
                <li key={p.key} data-mode={mode}>
                  <span aria-hidden>{mode === 'allow' ? '✓' : mode === 'ask' ? '?' : '✕'}</span>{' '}
                  {p.label} <small>({mode})</small>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="monitor-sub">
          <h5>Stop / resume history</h5>
          {history.length === 0 && <NoData />}
          <ul>
            {[...history].reverse().slice(0, 6).map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {h.action === 'started' ? 'Resumed' : 'Stopped'} <time>{timeAgo(h.at)}</time>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Panel 2: Performance ── */}
      <section className="monitor-panel" aria-label="Performance">
        <h4>Performance</h4>
        <dl className="monitor-grid">
          <div>
            <dt>Action success rate</dt>
            <dd>
              {outcomes ? (
                `${Math.round(outcomes.rate * 100)}% (${outcomes.completed}✓/${outcomes.failed}✗)`
              ) : (
                <NoData />
              )}
            </dd>
          </div>
          <div>
            <dt>Error rate</dt>
            <dd>
              {outcomes ? (
                `${Math.round((1 - outcomes.rate) * 100)}% — ${outcomes.failed} failed of ${outcomes.completed + outcomes.failed}`
              ) : (
                <NoData />
              )}
            </dd>
          </div>
          <div>
            <dt>Memory operations</dt>
            <dd>
              {memops ? (
                `${memops.reads} reads · ${memops.writes} writes · ${memops.reinforcements} reinforcements`
              ) : (
                <NoData />
              )}
            </dd>
          </div>
          <div>
            <dt>Cost / tokens</dt>
            <dd>
              <NoData /> <small className="monitor-note">the runtime does not expose cost yet</small>
            </dd>
          </div>
        </dl>
        <div className="monitor-sub">
          <h5>Tool latency by category (avg)</h5>
          {latencies.length === 0 && <NoData />}
          <ul>
            {latencies.map((l) => (
              <li key={l.category}>
                {l.category} — {formatMs(l.avgMs)} <small>({l.samples} runs)</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="monitor-sub">
          <h5>Actions per hour</h5>
          {!hoursHaveData ? (
            <NoData />
          ) : (
            <Sparkline
              values={hours.map((h) => h.count)}
              label={`Hourly completed + failed tasks, last 12 hours. Total ${hours.reduce((n, h) => n + h.count, 0)}.`}
            />
          )}
        </div>
        <div className="monitor-sub">
          <h5>Recent errors</h5>
          {errors.length === 0 && outcomes && <p className="monitor-note">No errors recorded.</p>}
          {errors.length === 0 && !outcomes && <NoData />}
          <ul>
            {errors.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span>{e.text}</span> <time>{timeAgo(e.at)}</time>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Panel 3: Growth & Self-Improvement ── */}
      <section className="monitor-panel" aria-label="Growth and self-improvement">
        <h4>Growth &amp; self-improvement</h4>
        <div className="monitor-sub">
          <h5>Learning heatmap — last 90 days</h5>
          {!heat ? (
            <NoData />
          ) : (
            <>
              <div className="monitor-heat" role="img" aria-label={heatCaption(heat.map((c) => c.count))}>
                {heat.map((c) => (
                  <span key={c.dateISO} data-level={heatLevel(c.count)} title={`${c.dateISO}: ${c.count}`} />
                ))}
              </div>
              <p className="monitor-note">
                Real self-improvement events per day (skill promotions + memory consolidations).
              </p>
            </>
          )}
        </div>
        <div className="monitor-sub">
          <h5>Skill count over time</h5>
          {curve.length === 0 ? (
            <NoData />
          ) : (
            <Sparkline
              values={curve.map((p) => p.total)}
              label={`Cumulative skills, now at ${curve[curve.length - 1].total}.`}
            />
          )}
        </div>
        <div className="monitor-sub">
          <h5>Optimization trends</h5>
          {successTrend.length < 2 && latencyTrend.length < 2 ? (
            <NoData />
          ) : (
            <>
              {successTrend.length >= 2 && (
                <div>
                  <small>Rolling success rate</small>
                  <Sparkline
                    values={successTrend.map((v) => Math.round(v * 100))}
                    label={`Rolling success rate, latest ${Math.round(successTrend[successTrend.length - 1] * 100)} percent.`}
                  />
                </div>
              )}
              {latencyTrend.length >= 2 && (
                <div>
                  <small>Rolling tool latency (ms)</small>
                  <Sparkline
                    values={latencyTrend}
                    label={`Rolling average tool latency, latest ${latencyTrend[latencyTrend.length - 1]} milliseconds.`}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div className="monitor-sub">
          <h5>Velocity — skills per week, by source</h5>
          {velocity.length === 0 ? (
            <NoData />
          ) : (
            <ul className="monitor-velocity">
              {velocity.map((w) => (
                <li key={w.weekISO}>
                  <span>{w.weekISO}</span>
                  <span className="monitor-bars" aria-hidden>
                    <i style={{ width: `${Math.min(100, w.evolve * 25)}%` }} data-src="evolve" />
                    <i style={{ width: `${Math.min(100, w.gepaPr * 25)}%` }} data-src="gepa" />
                  </span>
                  <small>
                    {w.evolve} /evolve · {w.gepaPr} GEPA-PR
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Panel 4: Skill Ledger ── */}
      <section className="monitor-panel" aria-label="Skill ledger">
        <h4>Skill ledger</h4>
        {skills.length === 0 ? (
          <NoData />
        ) : (
          <table className="monitor-ledger">
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Origin</th>
                <th scope="col">Score</th>
                <th scope="col">Added</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.id}>
                  <td title={s.evidence ?? undefined}>{s.name}</td>
                  <td>{SKILL_ORIGIN_LABEL[s.origin]}</td>
                  <td>{Math.round(s.score * 100)}%</td>
                  <td>
                    <time dateTime={s.createdAt}>{timeAgo(s.createdAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function NoData() {
  return <span className="monitor-nodata">Not enough data yet</span>
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function heatLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function heatCaption(counts: number[]): string {
  const active = counts.filter((c) => c > 0).length
  const total = counts.reduce((n, c) => n + c, 0)
  return `${total} learning events across ${active} of the last 90 days.`
}

/** Garis tren SVG mungil tanpa library — nilai selalu dari event nyata. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 100
  const h = 28
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg className="monitor-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={points} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
