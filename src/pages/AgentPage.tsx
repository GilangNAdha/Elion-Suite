import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import { AgentChat } from '../components/agent/AgentChat'
import { ConnectPanel } from '../components/agent/ConnectPanel'
import { SentientPanel } from '../components/agent/SentientPanel'
import { AgentJobsPanel } from '../components/settings/AgentJobsPanel'
import { AgentSkillsPanel } from '../components/settings/AgentSkillsPanel'
import { useActivityFeed } from '../lib/activity'
import { useRuntimeStore } from '../lib/agentRuntime'
import { timeAgo } from '../lib/time'

/**
 * /agent — halaman agent terpadu (Part V spek): chat, Connect AI, Sentient
 * control, jobs terjadwal, skills, dan timeline aktivitas nyata — semuanya
 * membaca state runtime yang sama dengan /elion dan Settings (satu sumber).
 */
export function AgentPage() {
  const runtime = useRuntimeStore()
  const feed = useActivityFeed()
  const [tab, setTab] = useState<'jobs' | 'skills' | 'activity'>('jobs')

  useEffect(() => {
    if (!feed.ready) void feed.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="agent-page">
      <header className="agent-page-head">
        <span className="elion-dot is-work" aria-hidden />
        <div>
          <h1>Agent</h1>
          <p>{runtime.enabled ? (runtime.busy ? 'Working in the background' : 'Sentient Mode on — watching for useful work') : 'Chat ready — Sentient Mode off'}</p>
        </div>
      </header>

      <div className="agent-hub">
        <div className="agent-hub-main">
          <AgentChat />

          <div className="agent-hub-tabs" role="tablist" aria-label="Agent panels">
            {(
              [
                ['jobs', 'Scheduled jobs'],
                ['skills', 'Skills'],
                ['activity', 'Activity']
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`hub-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="agent-hub-panel" role="tabpanel">
            {tab === 'jobs' && <AgentJobsPanel />}
            {tab === 'skills' && <AgentSkillsPanel />}
            {tab === 'activity' && <AgentTimeline />}
          </div>
        </div>

        <aside className="agent-hub-rail">
          <ConnectPanel />
          <SentientPanel />
          <section className="elion-mini" aria-label="Runtime pointer">
            <h2>
              <Cpu size={13} aria-hidden /> Deeper control
            </h2>
            <p>Permission Center, monitoring dashboard and system access live in Settings › ELION runtime.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** Timeline dari event nyata (§35/§38) — bukan narasi chat. */
function AgentTimeline() {
  const feed = useActivityFeed()
  const events = [...feed.events].reverse().slice(0, 20)
  if (!events.length) return <p className="agent-empty">No events yet — they appear as the agent actually works.</p>
  return (
    <ul className="agent-timeline" aria-label="Activity timeline">
      {events.map((e) => (
        <li key={e.id}>
          <code>{e.kind}</code>
          {e.detail && <span>{e.detail}</span>}
          <time>{timeAgo(e.at)}</time>
        </li>
      ))}
    </ul>
  )
}
