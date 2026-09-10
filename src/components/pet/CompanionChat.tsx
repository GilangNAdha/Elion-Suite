import { useEffect, useRef, useState } from 'react'
import { Link2, Send, Square, Trash2, ShieldCheck, SlidersHorizontal, X, Copy, RefreshCw, Check, Layers } from 'lucide-react'
import { useCompanionStore } from '../../stores/companionStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useLockdownStore } from '../../stores/lockdownStore'
import { aiIsConfigured, useAiStore } from '../../stores/aiStore'
import { providerPreset } from '../../lib/aiProviders'
import { IconBtn, Menu, MenuItem, MenuLabel, MenuSep, Toggle } from '../ui'
import { AiProviderSettings } from '../ai/AiProviderSettings'
import { DictationButton } from '../Dictation'
import { NovaPet } from './NovaPet'
import { MiniMarkdown } from '../../lib/miniMarkdown'

/** Konteks kerja yang boleh dibagikan: fokus aktif + maks 6 judul task terbuka. */
function buildWorkContext() {
  const items = Object.values(useItemsStore.getState().items)
    .filter((item) => item.type !== 'habit' && item.status !== 'done')
    .slice(0, 6)
  const active = useLockdownStore.getState().active
  return `Current focus objective: ${active?.objective || 'No active focus session'}\nOpen task titles:\n${items
    .map((item) => `- ${item.title}`)
    .join('\n')}`
}

export function CompanionChat({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const state = useCompanionStore()
  const aiSettings = useAiStore((s) => s.settings)
  const discovered = useAiStore((s) => s.discovered)
  const discoveredDetails = useAiStore((s) => s.discoveredDetails)
  const discoveredFor = useAiStore((s) => s.discoveredFor)
  const probing = useAiStore((s) => s.probing)
  const probeModels = useAiStore((s) => s.probeModels)
  const patchAi = useAiStore((s) => s.patch)
  const [draft, setDraft] = useState('')
  const [settings, setSettings] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const busy = state.activity !== 'idle'
  const preset = providerPreset(aiSettings.providerId)
  const cloud = preset.api !== 'minicpm' && aiIsConfigured(aiSettings)
  const local = preset.api === 'minicpm' && state.connection === 'ready'
  const connected = cloud || local

  useEffect(() => {
    const element = log.current
    if (element && state.messages.length && pinnedToBottom) element.scrollTop = element.scrollHeight
  }, [state.messages, state.activity, pinnedToBottom])

  // Buka chat dengan setup cloud yang valid → pastikan daftar model segar sekali.
  useEffect(() => {
    if (cloud && !probing && discoveredFor !== aiSettings.baseUrl) void probeModels()
    // sengaja hanya saat mount/buka panel — probe ulang sudah didebounce di AiProviderSettings
  }, [cloud]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    if (!draft.trim() || busy || !connected) return
    void state.send(draft, buildWorkContext())
    setDraft('')
    setPinnedToBottom(true)
  }
  const retry = () => {
    const lastUser = [...state.messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || busy || !connected) return
    state.retry(lastUser.content, buildWorkContext())
    setPinnedToBottom(true)
  }
  const copy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard ditolak — biarkan seleksi manual */
    }
  }
  const lastIndex = state.messages.length - 1
  const canRetry = !!state.messages.length && !busy && connected
  const modelOptions = Array.from(new Set([...discovered, ...(discovered.length ? [] : preset.examples)]))
  const contextOf = (id: string) => discoveredDetails[id]?.context
  const formatContext = (tokens?: number) =>
    tokens ? (tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens)) : null

  return (
    <section className={`nova-chat ${compact ? 'is-compact' : ''}`} aria-label="Chat with Elion">
      <header className="nova-chat-heading">
        <div className="chat-avatar">
          <NovaPet size={40} />
        </div>
        <div>
          <h2>Chat with Elion</h2>
          <span>
            <i className={connected ? 'is-connected' : ''} />
            {connected
              ? cloud
                ? `${preset.name} · ${aiSettings.model}`
                : 'MiniCPM is connected'
              : state.connection === 'checking'
                ? 'Connecting to MiniCPM…'
                : preset.api === 'minicpm'
                  ? 'Local model not connected'
                  : 'Finish the setup below to chat'}
          </span>
        </div>
        <span className="chat-heading-spacer" />
        {cloud && modelOptions.length > 0 && (
          <Menu
            align="end"
            width={280}
            panelClassName="chat-model-menu"
            trigger={
              <IconBtn label="Switch model">
                <Layers size={15} />
              </IconBtn>
            }
          >
            <MenuLabel>Switch model</MenuLabel>
            {modelOptions.slice(0, 24).map((id) => (
              <MenuItem
                key={id}
                label={id}
                shortcut={formatContext(contextOf(id)) ?? undefined}
                active={id === aiSettings.model}
                onClick={() => patchAi({ model: id })}
              />
            ))}
            <MenuSep />
            <MenuItem label="Reload model list…" onClick={() => void probeModels()} />
          </Menu>
        )}
        <IconBtn
          label="Companion connection settings"
          active={settings}
          onClick={() => setSettings((open) => !open)}
        >
          <SlidersHorizontal size={15} />
        </IconBtn>
        {state.messages.length > 0 && (
          <IconBtn
            label="Clear conversation"
            onClick={() => {
              if (window.confirm('Clear this conversation?')) state.clear()
            }}
          >
            <Trash2 size={14} />
          </IconBtn>
        )}
        {onClose && (
          <IconBtn
            label="Close companion chat"
            onClick={() => {
              state.cancel()
              onClose()
            }}
          >
            <X size={16} />
          </IconBtn>
        )}
      </header>
      {(settings || !connected) && (
        <div className="nova-connection-panel" data-details={settings}>
          {!connected && (
            <>
              <div className="connection-panel-title">
                <Link2 size={16} />
                <strong>Give Elion a mind — any model you like.</strong>
              </div>
              <p>
                Pick a provider, paste its key, choose a model. OpenRouter, 9Router, Claude, OpenAI Codex,
                Gemini, Groq, local Ollama or LM Studio all work; your conversations still stay on your machine.
              </p>
            </>
          )}
          <AiProviderSettings compact />
          <Toggle
            label="Share my work context"
            hint="Only your current focus objective and up to six open task titles. Never your screen, files, or full documents."
            checked={state.shareContext}
            onChange={state.setShareContext}
          />
        </div>
      )}
      <div
        className="nova-chat-log"
        ref={log}
        role="log"
        aria-label="Conversation"
        aria-live="off"
        onScroll={(event) => {
          const el = event.currentTarget
          setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 64)
        }}
      >
        {!state.messages.length ? (
          <div className="nova-chat-empty">
            <span className="chat-empty-spark">✦</span>
            <h3>A thought, a plan, a little clarity.</h3>
            <p>
              {connected
                ? 'Ask for a plan, a breakdown, or a second opinion on what you’re working on.'
                : 'Once set up, Elion can help you plan projects, break work down and find the next step.'}
            </p>
            <div className="nova-suggestions">
              {[
                'Help me find my next step',
                'Break a big task into small steps',
                'Plan a focused 25 minutes'
              ].map((text) => (
                <button
                  key={text}
                  onClick={() => {
                    setDraft(text)
                    textarea.current?.focus()
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          state.messages.map((message, index) => (
            <div key={message.id} className={`nova-message from-${message.role}`}>
              <span className="message-author">{message.role === 'user' ? 'You' : 'Elion'}</span>
              {message.content ? (
                <MiniMarkdown text={message.content} />
              ) : busy ? (
                <span className="thinking-dots" aria-label="Elion is thinking">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {message.content && !(busy && index === lastIndex) && (
                <span className="message-actions">
                  <button
                    type="button"
                    onClick={() => void copy(message.id, message.content)}
                    aria-label={copiedId === message.id ? 'Copied' : 'Copy message'}
                  >
                    {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  {message.role === 'assistant' && index === lastIndex && canRetry && (
                    <button type="button" onClick={retry} aria-label="Try again">
                      <RefreshCw size={12} />
                    </button>
                  )}
                </span>
              )}
              {message.interrupted && (
                <small>
                  Reply stopped{' '}
                  {index === lastIndex && canRetry && (
                    <button type="button" className="mini-inline-action" onClick={retry}>
                      Try again
                    </button>
                  )}
                </small>
              )}
            </div>
          ))
        )}
      </div>
      {!pinnedToBottom && state.messages.length > 0 && (
        <button className="chat-jump-latest" onClick={() => {
          setPinnedToBottom(true)
          const el = log.current
          if (el) el.scrollTop = el.scrollHeight
        }}>
          Jump to latest
        </button>
      )}
      {state.error && (
        <div className="nova-chat-error" role="alert">
          {state.error}
          <button onClick={() => void state.connect()}>Check connection</button>
          {canRetry && <button onClick={retry}>Try again</button>}
        </div>
      )}
      <form
        className="nova-composer"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          ref={textarea}
          aria-label="Message Elion"
          placeholder={connected ? 'What’s on your mind?' : 'Write a thought for when Elion is set up…'}
          value={draft}
          maxLength={4000}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
        />
        <div>
          <span className="chat-provider-badge">
            <ShieldCheck size={12} />
            {connected ? (cloud ? `${preset.name}` : 'MiniCPM gateway') : 'No model connected'}
          </span>
          {draft.length > 3200 && (
            <span className={`chat-count ${draft.length >= 4000 ? 'is-max' : ''}`}>{draft.length}/4000</span>
          )}
          <DictationButton label="Dictate message to Elion" getTarget={() => textarea.current} />
          {busy ? (
            <button className="chat-send" type="button" aria-label="Stop Elion reply" onClick={state.cancel}>
              <Square size={13} />
            </button>
          ) : (
            <button
              className="chat-send"
              type="submit"
              aria-label="Send message to Elion"
              disabled={!draft.trim() || !connected}
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </form>
      <span className="sr-only" role="status">
        {state.activity === 'thinking'
          ? 'Elion is thinking'
          : state.activity === 'talking'
            ? 'Elion is replying'
            : connected && state.messages.length
              ? 'Reply ready'
              : ''}
      </span>
    </section>
  )
}
