import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Square, Trash2 } from 'lucide-react'
import { useAgentChatStore } from '../../stores/agentChatStore'
import { aiIsConfigured, useAiStore } from '../../stores/aiStore'
import { MiniMarkdown } from '../../lib/miniMarkdown'
import { timeAgo } from '../../lib/time'
import { Button } from '../ui'

/**
 * Chat agent (dipakai /elion dan /agent) — satu store, satu UI: pesan,
 * tool activity, composer. Tidak ada logika agent di sini (§9): semua
 * eksekusi ada di agentChat/agentRuntime.
 */
export function AgentChat() {
  const chat = useAgentChatStore()
  const ai = useAiStore((s) => s.settings)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const configured = aiIsConfigured(ai)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages, chat.busy])

  const state = useMemo(() => {
    if (!configured) return { label: 'Offline', cls: 'is-off' }
    if (chat.activeTool) return { label: `Using ${chat.activeTool}`, cls: 'is-work' }
    if (chat.busy) return { label: 'Thinking', cls: 'is-think' }
    return { label: 'Chat ready', cls: '' }
  }, [configured, chat.activeTool, chat.busy])

  const send = () => {
    if (!draft.trim() || chat.busy) return
    chat.send(draft)
    setDraft('')
  }

  return (
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
          Agent chat needs a provider. <Link to="/agent">Connect one on the Agent page</Link> or in{' '}
          <Link to="/settings#ai">Settings › AI assistant</Link>.
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
  )
}
