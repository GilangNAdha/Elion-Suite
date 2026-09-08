import { useEffect, useRef, useState } from 'react'
import {
  Link2,
  LoaderCircle,
  Send,
  Square,
  Trash2,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Unplug
} from 'lucide-react'
import { useCompanionStore } from '../../stores/companionStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useLockdownStore } from '../../stores/lockdownStore'
import { Button, IconBtn, Toggle } from '../ui'
import { DictationButton } from '../Dictation'
import { NovaPet } from './NovaPet'

export function CompanionChat({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const state = useCompanionStore()
  const [draft, setDraft] = useState('')
  const [settings, setSettings] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const busy = state.activity !== 'idle'
  const connected = state.connection === 'ready'
  useEffect(() => {
    const element = log.current
    if (element && state.messages.length) element.scrollTop = element.scrollHeight
  }, [state.messages, state.activity])
  const send = () => {
    if (!draft.trim() || busy || !connected) return
    const items = Object.values(useItemsStore.getState().items)
      .filter((item) => item.type !== 'habit' && item.status !== 'done')
      .slice(0, 6)
    const active = useLockdownStore.getState().active
    const context = `Current focus objective: ${active?.objective || 'No active focus session'}\nOpen task titles:\n${items.map((item) => `- ${item.title}`).join('\n')}`
    void state.send(draft, context)
    setDraft('')
  }
  return (
    <section className={`nova-chat ${compact ? 'is-compact' : ''}`} aria-label="Chat with Nova">
      <header className="nova-chat-heading">
        <div className="chat-avatar">
          <NovaPet size={40} />
        </div>
        <div>
          <h2>Chat with Nova</h2>
          <span>
            <i className={connected ? 'is-connected' : ''} />
            {connected
              ? 'MiniCPM is connected'
              : state.connection === 'checking'
                ? 'Connecting to MiniCPM…'
                : 'Local model not connected'}
          </span>
        </div>
        <span className="chat-heading-spacer" />
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
          {!connected ? (
            <>
              <div className="connection-panel-title">
                <Link2 size={16} />
                <strong>A local mind for your companion.</strong>
              </div>
              <p>
                Connect MiniCPM Desk Pet to talk with Nova. Your conversations stay on your machine when you
                run Elion locally.
              </p>
              <div className="connection-steps">
                <span>
                  <b>1</b>Open MiniCPM Desk Pet
                </span>
                <span>
                  <b>2</b>Finish its local model setup
                </span>
                <span>
                  <b>3</b>Connect it to Elion
                </span>
              </div>
              <div className="connection-actions">
                <Button
                  size="sm"
                  disabled={state.connection === 'checking'}
                  icon={state.connection === 'checking' ? <LoaderCircle size={13} /> : <Link2 size={13} />}
                  onClick={() => void state.connect()}
                >
                  {state.connection === 'checking' ? 'Connecting…' : 'Connect MiniCPM'}
                </Button>
                <a
                  href="https://github.com/OpenBMB/MiniCPM-Desk-Pet#installation"
                  target="_blank"
                  rel="noreferrer"
                >
                  Setup guide
                </a>
              </div>
              <p className="preview-connection-note">
                The browser preview connects to its app server, not your PC. Run Elion locally or use the
                desktop app to reach your own model.
              </p>
            </>
          ) : (
            <>
              <div className="connected-model">
                <ShieldCheck size={16} />
                <span>
                  <strong>{state.health?.model_name || 'MiniCPM local model'}</strong>
                  <small>
                    {state.health?.backend || 'Local inference'} on {state.health?.device || 'your device'}
                  </small>
                </span>
                <Button size="sm" variant="ghost" icon={<Unplug size={12} />} onClick={state.disconnect}>
                  Disconnect
                </Button>
              </div>
            </>
          )}
          <Toggle
            label="Share my work context"
            hint="Only your current focus objective and up to six open task titles. Never your screen, files, or full documents."
            checked={state.shareContext}
            onChange={state.setShareContext}
          />
        </div>
      )}
      <div className="nova-chat-log" ref={log} role="log" aria-label="Conversation" aria-live="off">
        {!state.messages.length ? (
          <div className="nova-chat-empty">
            <span className="chat-empty-spark">✦</span>
            <h3>A thought, a plan, a little clarity.</h3>
            <p>
              {connected
                ? 'Tell Nova what’s on your mind.'
                : 'Once connected, Nova can help you break down work and find a next step.'}
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
          state.messages.map((message) => (
            <div key={message.id} className={`nova-message from-${message.role}`}>
              <span className="message-author">{message.role === 'user' ? 'You' : 'Nova'}</span>
              {message.content ? (
                <p>{message.content}</p>
              ) : busy ? (
                <span className="thinking-dots" aria-label="Nova is thinking">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {message.interrupted && <small>Reply stopped</small>}
            </div>
          ))
        )}
      </div>
      {state.error && (
        <div className="nova-chat-error" role="alert">
          {state.error}
          <button onClick={() => void state.connect()}>Check connection</button>
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
          aria-label="Message Nova"
          placeholder={connected ? 'What’s on your mind?' : 'Write a thought for when you connect…'}
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
          <span>
            <ShieldCheck size={12} />
            MiniCPM gateway
          </span>
          <DictationButton label="Dictate message to Nova" getTarget={() => textarea.current} />
          {busy ? (
            <button className="chat-send" type="button" aria-label="Stop Nova reply" onClick={state.cancel}>
              <Square size={13} />
            </button>
          ) : (
            <button
              className="chat-send"
              type="submit"
              aria-label="Send message to Nova"
              disabled={!draft.trim() || !connected}
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </form>
      <span className="sr-only" role="status">
        {state.activity === 'thinking'
          ? 'Nova is thinking'
          : state.activity === 'talking'
            ? 'Nova is replying'
            : connected && state.messages.length
              ? 'Reply ready'
              : ''}
      </span>
    </section>
  )
}
