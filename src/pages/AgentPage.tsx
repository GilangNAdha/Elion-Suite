import { useEffect, useState } from 'react'
import { AgentChat } from '../components/agent/AgentChat'
import { ConnectPanel } from '../components/agent/ConnectPanel'
import { SentientPanel } from '../components/agent/SentientPanel'
import { ActiveTasks, CurrentActivity, LiveActivity, agentStateLabel, useMonitorData } from '../components/agent/Monitor'
import { MemoryView } from '../components/agent/MemoryView'
import { PerformanceView } from '../components/agent/PerformanceView'
import { AgentJobsPanel } from '../components/settings/AgentJobsPanel'
import { AgentSkillsPanel } from '../components/settings/AgentSkillsPanel'
import { useActivityFeed } from '../lib/activity'
import { useRuntimeStore } from '../lib/agentRuntime'

/**
 * /agent — Permukaan operasi ELION (Master Prompt §6/§100): apa yang sedang
 * dikerjakan lebih dulu, kenapa, apa yang terjadi, apa berikutnya, sehat atau
 * tidak — semuanya dari state nyata. Chat dan pengaturan teknis menumpang,
 * bukan menjadi pusat.
 */

const TABS = [
  ['monitor', 'Monitor'],
  ['chat', 'Chat'],
  ['jobs', 'Jobs & skills'],
  ['performance', 'Performance'],
  ['memory', 'Memory']
] as const

type Tab = (typeof TABS)[number][0]

export function AgentPage() {
  const runtime = useRuntimeStore()
  const feed = useActivityFeed()
  const data = useMonitorData()
  const [tab, setTab] = useState<Tab>('monitor')
  const state = agentStateLabel(runtime.enabled, runtime.phase, runtime.activeTask)

  useEffect(() => {
    if (!feed.ready) void feed.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="agent-page">
      <header className="agent-hero">
        <div className="agent-hero-id">
          <span className={`agent-dot ${state.cls}`} aria-hidden />
          <h1>ELION</h1>
          <span className={`agent-state ${state.cls}`}>{state.label}</span>
        </div>
        <div className="agent-hero-actions">
          {runtime.enabled ? (
            <button type="button" className="elion-stop" onClick={() => runtime.setEnabled(false)}>
              Stop Elion
            </button>
          ) : (
            <button type="button" className="elion-start" onClick={() => runtime.setEnabled(true)}>
              Start Elion
            </button>
          )}
        </div>
      </header>

      <nav className="agent-tabs" role="tablist" aria-label="Agent sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`agent-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'monitor' && (
        <div className="agent-monitor">
          <div className="agent-monitor-main">
            <CurrentActivity data={data} />
            <LiveActivity />
            <ActiveTasks data={data} />
          </div>
          <aside className="agent-monitor-rail">
            <SentientPanel />
          </aside>
        </div>
      )}

      {tab === 'chat' && (
        <div className="agent-hub">
          <div className="agent-hub-main">
            <AgentChat />
          </div>
          <aside className="agent-hub-rail">
            <ConnectPanel />
            <section className="elion-mini" aria-label="Runtime pointer">
              <h2>Deeper control</h2>
              <p>Permission Center, monitoring dashboard and system access live in Settings › ELION runtime.</p>
            </section>
          </aside>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="agent-hub">
          <div className="agent-hub-main">
            <AgentJobsPanel />
            <AgentSkillsPanel />
          </div>
        </div>
      )}

      {tab === 'performance' && <PerformanceView />}
      {tab === 'memory' && <MemoryView />}
    </div>
  )
}
