import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Square, Trash2 } from 'lucide-react'
import { useAgentChatStore } from '../stores/agentChatStore'
import { aiIsConfigured, useAiStore } from '../stores/aiStore'
import { useRuntimeStore } from '../lib/agentRuntime'
import { usePermissionStore } from '../lib/permissions'
import { useActivityFeed } from '../lib/activity'
import { listObjectives, listTasks, type Objective } from '../lib/agentTasks'
import { MiniMarkdown } from '../lib/miniMarkdown'
import { timeAgo } from '../lib/time'
import { SentientPanel } from '../components/agent/SentientPanel'
import { Button } from '../components/ui'

/**
 * Halaman /elion — agent chat + Sentient Mode di UI (Part V spek v4.3).
 * Chat = agent tool-capable (bukan sekadar teks): tiap giliran boleh
 * memanggil tool nyata, dan blok tool-call tampil apa adanya di bawah pesan.
 */
export function ElionPage() {
  const chat = useAgentChatStore()
  const ai = useAiStore((s) => s.settings)
  const runtime = useRuntimeStore()
  const approvals = usePermissionStore((s) => s.approvals)
  const [draft, setDraft] = useState('')
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const configured = aiIsConfigured(ai)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages, chat.busy])

  useEffect(() => {
    const refresh = async () => {
      setObjectives(await listObjectives())
      const tasks = await listTasks(200)
      setQueue(tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'resumable').map((t) => t.title))
    }
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [])

  const state = useMemo(() => {
    if (!configured) return { label: 'Offline', cls: 'is-off' }
    if (approvals.length > 0) return { label: 'Attention', cls: 'is-attn' }
    if (chat.activeTool) return { label: `Using ${chat.activeTool}`, cls: 'is-work' }
    if (chat.busy) return { label: 'Thinking', cls: 'is-think' }
    if (runtime.busy) return { label: 'Working', cls: 'is-work' }
    return { label: runtime.enabled ? 'Idle' : 'Chat ready', cls: '' }
  }, [configured, approvals.length, chat.activeTool, chat.busy, runtime.busy, runtime.enabled])

  const send = () => {
    if (!draft.trim() || chat.busy) return
    chat.send(draft)
    setDraft('')
  }

  return (
    <div className="elion-page">
      <div className="elion-chat">
        <header className="elion-head">
          <span className={`elion-dot ${state.cls}`} aria-hidden />
          <div>
            <h1>Elion</h1>
            <p>{state.label}</p>
          </div>
          <div className="elion-head-actions">
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => chat.clear()}>
              Clear
            </Button>
          </div>
        </header>

        {!configured && (
          <p className="elion-warn">
            Agent chat needs a provider. <Link to="/settings#ai">Set it in Settings › AI assistant</Link>.
          </p>
        )}
        {chat.plainFallback && (
          <p className="elion-note">This provider has no function calling — plain chat, tools off.</p>
        )}
        {chat.error && <p className="elion-error">{chat.error}</p>}

        <div className="elion-messages" ref={scrollRef} role="log" aria-label="Agent conversation">
          {!chat.messages.length && (
            <div className="elion-empty">
              <p>Ask for real work — Elion can use tools here.</p>
              <p>“Remind me tomorrow at 9 to review the sprint” · “Create a task for the lab report”</p>
            </div>
          )}
          {chat.messages.map((m) => (
            <article key={m.id} className={`elion-msg is-${m.role}`}>
              <div className="elion-bubble">
                {m.content ? <MiniMarkdown text={m.content} /> : chat.busy && <span className="elion-typing">…</span>}
              </div>
              {m.toolCalls.length > 0 && (
                <ul className="elion-tools" aria-label="Tool activity">
                  {m.toolCalls.map((c, i) => (
                    <li key={i} data-ok={c.ok}>
                      <span aria-hidden>{c.ok ? '✓' : '✕'}</span> <code>{c.name}</code>
                      <small title={JSON.stringify(c.args)}> — {(c.ok ? c.output : c.error)?.slice(0, 140)}</small>
                    </li>
                  ))}
                </ul>
              )}
              <time>{timeAgo(m.at)}</time>
            </article>
          ))}
          {chat.busy && chat.activeTool && (
            <p className="elion-live" role="status">
              ◉ {chat.activeTool} — working…
            </p>
          )}
        </div>

        <div className="elion-composer">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask Elion to do something…"
            aria-label="Message Elion"
            disabled={chat.busy}
          />
          {chat.busy ? (
            <Button size="sm" variant="outline" icon={<Square size={13} />} onClick={() => chat.cancel()}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Send size={13} />} onClick={send} disabled={!draft.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>

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
          <Link to="/settings#runtime">Runtime + monitoring →</Link>
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
