import { useEffect, useState } from 'react'
import { Check, Link2, Loader2 } from 'lucide-react'
import { AI_PROVIDER_PRESETS, providerPreset } from '../../lib/aiProviders'
import { aiIsConfigured, useAiStore } from '../../stores/aiStore'
import { Button, Input, Select } from '../ui'

/**
 * Connect panel (§40/§60) — satu tombol "Connect" untuk menyambungkan Elion
 * ke provider mana pun: OpenRouter, 9Router, Anthropic/Claude, OpenAI/Codex,
 * Gemini, Kimi, Groq, Claude Code Router, Antigravity, Ollama, LM Studio,
 * MiniCPM lokal, atau endpoint custom. Key disimpan lokal (aiStore persist)
 * dan TIDAK PERNAH diberikan ke model/agent (Part IV ⛔).
 */
export function ConnectPanel() {
  const ai = useAiStore()
  const [draft, setDraft] = useState(() => ({ ...ai.settings, apiKey: '' }))
  const [probing, setProbing] = useState(false)

  // Refleksikan provider aktif — tombol Connect selalu menawarkan state terkini.
  useEffect(() => {
    setDraft((d) => ({ ...d, ...ai.settings, apiKey: '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.settings.providerId])

  const preset = providerPreset(draft.providerId)
  const connected = aiIsConfigured(ai.settings)

  const pick = (id: string) => {
    ai.setProvider(id)
    const next = providerPreset(id)
    setDraft((d) => ({ ...d, providerId: id, baseUrl: next.baseUrl, model: next.examples[0] ?? d.model, apiKey: '' }))
  }

  const connect = async () => {
    ai.patch({
      baseUrl: draft.baseUrl,
      model: draft.model,
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {})
    })
    // Verifikasi nyata: /models harus benar-benar menjawab sebelum klaim connect.
    setProbing(true)
    try {
      await ai.probeModels()
    } finally {
      setProbing(false)
    }
  }

  const ok = connected && !ai.probeError
  const keyHint = preset.needsKey ? 'API key stays on this device' : preset.keyHint ?? 'no key required'

  return (
    <section className="agent-connect" aria-label="Connect an AI provider">
      <h2>
        <Link2 size={14} aria-hidden /> Connect AI
      </h2>
      <div className="connect-providers" role="listbox" aria-label="Provider">
        {AI_PROVIDER_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={draft.providerId === p.id}
            className={`connect-chip ${draft.providerId === p.id ? 'is-active' : ''}`}
            onClick={() => pick(p.id)}
            title={p.tagline}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Input
        value={draft.baseUrl}
        placeholder="Base URL"
        aria-label="Provider base URL"
        onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
      />
      <Input
        type="password"
        value={draft.apiKey}
        placeholder={preset.needsKey ? `${preset.keyHint ?? 'API key'} — ${keyHint}` : keyHint}
        aria-label={`API key for ${preset.name}`}
        onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
        autoComplete="off"
      />
      <Input
        value={draft.model}
        placeholder="Model id"
        aria-label="Model id"
        onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
      />

      <div className="connect-actions">
        <Button
          size="sm"
          variant={ok ? 'outline' : 'primary'}
          onClick={() => void connect()}
          disabled={probing || !draft.baseUrl.trim() || !draft.model.trim()}
        >
          {probing ? (
            <>
              <Loader2 size={13} className="connect-spin" aria-hidden /> Testing…
            </>
          ) : ok ? (
            <>
              <Check size={13} aria-hidden /> Reconnect
            </>
          ) : (
            'Connect'
          )}
        </Button>
        <span className="connect-status" role="status">
          {probing
            ? 'Testing the endpoint…'
            : ai.probeError
              ? `Failed: ${ai.probeError}`
              : ok
                ? `Connected — ${preset.name} · ${ai.settings.model}${ai.probeMs ? ` (${ai.probeMs}ms)` : ''}`
                : 'Not connected yet'}
        </span>
      </div>
      <p className="agent-note">
        Keys never leave this device and are never given to the model. Local endpoints (Ollama, LM Studio, routers)
        work out of the box in the desktop build.
      </p>
    </section>
  )
}

// Select dipakai kalau user ingin memilih dari model hasil discovery.
export function ModelPicker() {
  const ai = useAiStore()
  if (!ai.discovered.length) return null
  return (
    <Select aria-label="Pick a discovered model" value={ai.settings.model} onChange={(e) => ai.patch({ model: e.target.value })}>
      {ai.discovered.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </Select>
  )
}
