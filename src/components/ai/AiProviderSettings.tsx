import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Unplug
} from 'lucide-react'
import { AI_PROVIDER_PRESETS, providerPreset } from '../../lib/aiProviders'
import { aiIsConfigured, PERSONA_PACKS, useAiStore } from '../../stores/aiStore'
import { useCompanionStore } from '../../stores/companionStore'
import { Button, Input, Slider } from '../ui'

/**
 * One configuration surface for every chat backend: OpenRouter, 9Router,
 * Claude, OpenAI/Codex, Ollama, LM Studio, MiniCPM or any custom
 * OpenAI-compatible endpoint. Rendered inside the companion chat panel
 * (compact) and on Settings › AI assistant (full).
 */
export function AiProviderSettings({ compact = false }: { compact?: boolean }) {
  const { settings, discovered, discoveredFor, probing, probeError } = useAiStore()
  const setProvider = useAiStore((s) => s.setProvider)
  const patch = useAiStore((s) => s.patch)
  const probeModels = useAiStore((s) => s.probeModels)
  const setPersona = useAiStore((s) => s.setPersona)
  const probeMs = useAiStore((s) => s.probeMs)
  const discoveredDetails = useAiStore((s) => s.discoveredDetails)
  const [showKey, setShowKey] = useState(false)
  const preset = providerPreset(settings.providerId)
  const configured = aiIsConfigured(settings)
  const companion = useCompanionStore()
  const isMiniCpm = preset.api === 'minicpm'
  const modelListId = useMemo(() => `ai-models-${settings.providerId}`, [settings.providerId])
  const modelSource =
    discovered.length && discoveredFor === (settings.baseUrl || 'minicpm') ? discovered : []

  // Re-validate whenever a cloud config is edited: the probe doubles as the
  // "connect" step, mirroring how the MiniCPM gateway works.
  useEffect(() => {
    if (isMiniCpm || !configured) return
    const t = setTimeout(() => void probeModels(), 700)
    return () => clearTimeout(t)
  }, [settings.baseUrl, settings.apiKey, settings.model, isMiniCpm, configured, probeModels])

  return (
    <div className="ai-settings">
      <div className={`ai-provider-grid ${compact ? 'is-compact' : ''}`} role="radiogroup" aria-label="AI provider">
        {AI_PROVIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={settings.providerId === p.id}
            className={`ai-provider-card ${settings.providerId === p.id ? 'is-selected' : ''}`}
            onClick={() => setProvider(p.id)}
          >
            <span>
              {p.name}
              {settings.providerId === p.id && (
                <Check size={13} aria-label="Selected" className="ai-provider-check" />
              )}
            </span>
            {!compact && <small>{p.tagline}</small>}
          </button>
        ))}
      </div>

      {isMiniCpm ? (
        <div className="ai-minicpm">
          <div className="ai-row-line">
            <span className="ios-row-label">
              Local MiniCPM gateway
              <small>
                {companion.health?.model_name
                  ? `${companion.health.model_name} on ${companion.health.device || 'your device'}`
                  : 'Requires MiniCPM Desk Pet running its model on this machine.'}
              </small>
            </span>
            {companion.connection === 'ready' ? (
              <Button size="sm" variant="ghost" icon={<Unplug size={12} />} onClick={companion.disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                aria-label="Connect MiniCPM"
                icon={companion.connection === 'checking' ? <LoaderCircle size={12} /> : <PlugZap size={12} />}
                disabled={companion.connection === 'checking'}
                onClick={() => void companion.connect()}
              >
                {companion.connection === 'checking' ? 'Connecting…' : 'Connect'}
              </Button>
            )}
          </div>
          {companion.error && <p className="ai-probe-line is-error">{companion.error}</p>}
        </div>
      ) : (
        <>
          <div className={`ai-form ${compact ? 'is-tight' : ''}`}>
            <label>
              <span className="ai-field-label">Base URL</span>
              <Input
                value={settings.baseUrl}
                placeholder={preset.baseUrl || 'https://your-gateway.example/v1'}
                spellCheck={false}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                aria-label="API base URL"
              />
            </label>
            <label>
              <span className="ai-field-label">API key{preset.needsKey ? ' (required)' : ' (optional)'}</span>
              <span className="ai-key-row">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  placeholder={preset.keyHint ?? 'Not needed for this endpoint'}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => patch({ apiKey: e.target.value })}
                  aria-label="API key"
                />
                <button
                  type="button"
                  className="ai-key-reveal focus-ring"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </label>
            <label>
              <span className="ai-field-label">
                Model
                <button
                  type="button"
                  className="ai-probe focus-ring"
                  onClick={() => void probeModels()}
                  disabled={probing}
                >
                  {probing ? <LoaderCircle size={12} className="spin-slow" /> : <RefreshCw size={12} />}
                  {modelSource.length ? `${modelSource.length} found` : 'Load models'}
                </button>
              </span>
              <Input
                value={settings.model}
                placeholder={preset.examples[0] ?? 'model-id'}
                spellCheck={false}
                list={modelListId}
                onChange={(e) => patch({ model: e.target.value })}
                aria-label="Model id"
              />
              <datalist id={modelListId}>
                {modelSource.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </label>
            {!compact && preset.examples.length > 0 && !modelSource.length && (
              <span className="ai-examples">
                Try:
                {preset.examples.map((id) => (
                  <button key={id} type="button" className="ai-example focus-ring" onClick={() => patch({ model: id })}>
                    {id}
                  </button>
                ))}
              </span>
            )}
            {probeError && <p className="ai-probe-line is-error">{probeError}</p>}
            {!probeError && modelSource.length > 0 && (
              <p className="ai-probe-line is-ok">
                <Check size={12} /> Endpoint answered — {modelSource.length} model{modelSource.length > 1 ? 's' : ''} available.
                {probeMs != null && <> Latency: {probeMs} ms.</>}
                {discoveredDetails[settings.model]?.context
                  ? ` Current model context: ~${Math.round(discoveredDetails[settings.model].context! / 1000)}K tokens.`
                  : ''}
              </p>
            )}
          </div>
          {!compact && (
            <div className="ai-sliders">
              <Slider
                label="Creativeness"
                value={settings.temperature}
                min={0}
                max={2}
                step={0.05}
                onChange={(v) => patch({ temperature: v })}
              />
              <Slider
                label="Reply length cap"
                value={settings.maxTokens}
                min={128}
                max={4096}
                step={128}
                suffix=" tok"
                onChange={(v) => patch({ maxTokens: v })}
              />
            </div>
          )}
          {!compact && (
            <div className="ai-persona" role="radiogroup" aria-label="Elion personality">
              <span className="ai-field-label">Personality</span>
              <div className="persona-chips">
                {PERSONA_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.personaId === pack.id}
                    className={`persona-chip ${settings.personaId === pack.id ? 'is-selected' : ''}`}
                    onClick={() => setPersona(pack.id)}
                  >
                    <strong>{pack.name}</strong>
                    <small>{pack.blurb}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!compact && (
            <details className="ai-persona">
              <summary>Custom persona override (optional)</summary>
              <textarea
                className="focus-ring ai-persona-text"
                rows={3}
                placeholder="Leave empty for Elion’s default persona: Gilang's project agent — direct, warm, a little dry-witted."
                value={settings.systemPrompt}
                onChange={(e) => patch({ systemPrompt: e.target.value })}
                aria-label="Custom system prompt"
              />
            </details>
          )}
          <p className="ai-privacy">
            Keys live only in this device’s local storage and are sent only to the endpoint above. Nothing
            leaves this device except the request to that endpoint.{' '}
            {compact && (
              <Link to="/settings#ai">Full options in Settings</Link>
            )}
          </p>
        </>
      )}
    </div>
  )
}
