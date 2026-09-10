import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityFeed } from '../lib/activity'
import { listObjectives, listTasks, type Objective } from '../lib/agentTasks'
import { SentientPanel } from '../components/agent/SentientPanel'
import { WhileAway } from '../components/agent/WhileAway'
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
