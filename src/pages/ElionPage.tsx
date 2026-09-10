import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityFeed } from '../lib/activity'
import { listObjectives, listTasks, type Objective } from '../lib/agentTasks'
import { SentientPanel } from '../components/agent/SentientPanel'
import { AgentChat } from '../components/agent/AgentChat'

/**
 * Halaman /elion — chat agent fokus (Part V spek). Chatnya DIEXTRACT ke
 * AgentChat supaya /agent memakai UI dan store yang sama persis; halaman ini
 * tinggal menambahkan rail Sentient + "while you were away" + objektif.
 */
export function ElionPage() {
  const feed = useActivityFeed()
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [queue, setQueue] = useState<string[]>([])

  useEffect(() => {
    if (!feed.ready) void feed.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const refresh = async () => {
      setObjectives(await listObjectives())
      const tasks = await listTasks(200)
      setQueue(
        tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'resumable').map((t) => t.title)
      )
    }
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="elion-page">
      <AgentChat />
      <aside className="elion-rail">
        <SentientPanel />
        <WhileAway />
        <section className="elion-mini" aria-label="Objectives">
          <h2>Objectives</h2>
          {objectives.filter((o) => !o.done).length === 0 && <p>None open.</p>}
          <ul>
            {objectives
              .filter((o) => !o.done)
              .slice(0, 4)
              .map((o) => (
                <li key={o.id}>{o.text}</li>
              ))}
          </ul>
        </section>
        <section className="elion-mini" aria-label="Background queue">
          <h2>Background queue</h2>
          {queue.length === 0 && <p>Empty.</p>}
          <ul>
            {queue.slice(0, 5).map((title, i) => (
              <li key={i}>{title}</li>
            ))}
          </ul>
          <Link to="/agent">Full agent hub →</Link>
        </section>
      </aside>
    </div>
  )
}

const LAST_SEEN_KEY = 'elion-last-seen'

/** "While you were away" — DARI event tercatat, tidak pernah dikarang (§8). */
function WhileAway() {
  const events = useActivityFeed((s) => s.events)
  const [report, setReport] = useState<string[] | null>(null)

  useEffect(() => {
    let lastSeen = ''
    try {
      lastSeen = localStorage.getItem(LAST_SEEN_KEY) ?? ''
    } catch {
      lastSeen = ''
    }
    if (lastSeen) {
      const fresh = events.filter((e) => e.at > lastSeen)
      const lines: string[] = []
      for (const e of fresh) {
        if (e.kind === 'task.completed') lines.push(`Finished: ${e.detail ?? 'a task'}`)
        else if (e.kind === 'task.failed') lines.push(`Failed: ${e.detail ?? 'a task'}`)
        else if (e.kind === 'objective.surfaced') lines.push(`Still open: ${e.detail ?? 'an objective'}`)
        else if (e.kind === 'permission.granted' || e.kind === 'permission.denied')
          lines.push(`Permission ${e.kind === 'permission.granted' ? 'granted' : 'denied'}: ${e.detail ?? ''}`)
        else if (e.kind === 'sentient.stopped') lines.push('Sentient Mode was stopped')
        else if (e.kind === 'sentient.started') lines.push('Sentient Mode resumed')
      }
      setReport(lines.slice(-6))
    } else {
      setReport(null)
    }
    try {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    } catch {
      /* abaikan */
    }
    // Sekali per kunjungan halaman — marker ditulis saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!report || !report.length) return null
  return (
    <section className="elion-mini" aria-label="While you were away">
      <h2>While you were away</h2>
      <ul>
        {report.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
