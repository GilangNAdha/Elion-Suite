import { FloatingPetSettings } from '../components/pet/FloatingPetSettings'
import { assetUrl } from '../lib/assets'
import { VoiceSettings } from '../components/VoiceSettings'
import { useMemo, useRef, useState } from 'react'
import {
  Palette,
  Download,
  Upload,
  Trash2,
  Moon,
  Sun,
  SlidersHorizontal,
  Mic,
  ShieldAlert,
  MapPin,
  Info,
  Check,
  X,
  Swords
} from 'lucide-react'
import type { AuroraTheme, Harmony } from '../lib/types'
import { uid } from '../lib/types'
import { useThemeStore } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { deriveTheme } from '../tokens/theme'
import { db } from '../lib/db'
import { Button, Input, Select, Slider, Toggle, Menu, MenuItem, MenuSep, IconBtn } from '../components/ui'

const HARMONIES: { id: Harmony; label: string }[] = [
  { id: 'complementary', label: 'Complementary' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'split-complementary', label: 'Split-complementary' },
  { id: 'monochromatic', label: 'Monochromatic' }
]

export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme)
  const presets = useThemeStore((s) => s.presets)
  const patch = useThemeStore((s) => s.patch)
  const applyPreset = useThemeStore((s) => s.applyPreset)
  const addPreset = useThemeStore((s) => s.addPreset)
  const removePreset = useThemeStore((s) => s.removePreset)
  const exportJSON = useThemeStore((s) => s.exportJSON)
  const importJSON = useThemeStore((s) => s.importJSON)
  const reducedMotion = useThemeStore((s) => s.reducedMotion)
  const setReducedMotion = useThemeStore((s) => s.setReducedMotion)
  const settings = useSettingsStore()
  const importRef = useRef<HTMLInputElement>(null)
  const [saveName, setSaveName] = useState('')

  const resolved = useMemo(() => deriveTheme(theme), [theme])

  return (
    <div className="mx-auto max-w-3xl p-6 pb-24">
      <h1 className="mb-5 text-[1.7em] font-bold tracking-tight">Settings</h1>
      <FloatingPetSettings />

      {/* ---------------- theme editor ---------------- */}
      <Section title="Theme" icon={<Palette size={15} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Slider
              label="Seed hue"
              value={theme.seed.h}
              min={0}
              max={359}
              onChange={(v) => patch({ seed: { ...theme.seed, h: v } })}
            />
            <Slider
              label="Seed saturation"
              value={theme.seed.s}
              min={0}
              max={100}
              onChange={(v) => patch({ seed: { ...theme.seed, s: v } })}
            />
            <Slider
              label="Seed lightness"
              value={theme.seed.l}
              min={20}
              max={80}
              onChange={(v) => patch({ seed: { ...theme.seed, l: v } })}
            />
            <label className="block">
              <span className="mb-1 block text-[0.82em] text-ink-muted">Harmony</span>
              <Select
                value={theme.harmony}
                onChange={(e) => patch({ harmony: e.target.value as Harmony })}
                aria-label="Harmony"
              >
                {HARMONIES.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-center gap-3">
              <button
                className={`focus-ring flex h-9 items-center gap-1.5 rounded-token-sm border px-3 text-[0.85em] ${theme.mode === 'dark' ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted'}`}
                onClick={() => patch({ mode: 'dark' })}
                aria-pressed={theme.mode === 'dark'}
              >
                <Moon size={14} /> Dark
              </button>
              <button
                className={`focus-ring flex h-9 items-center gap-1.5 rounded-token-sm border px-3 text-[0.85em] ${theme.mode === 'light' ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted'}`}
                onClick={() => patch({ mode: 'light' })}
                aria-pressed={theme.mode === 'light'}
              >
                <Sun size={14} /> Light
              </button>
              <Select
                value={theme.density}
                className="h-9"
                onChange={(e) => patch({ density: e.target.value as AuroraTheme['density'] })}
                aria-label="Density"
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </Select>
            </div>
            <Slider
              label="Corner radius"
              value={theme.radius}
              min={0}
              max={24}
              suffix="px"
              onChange={(v) => patch({ radius: v })}
            />
            <Slider
              label="Glass"
              value={theme.glass}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch({ glass: v })}
            />
          </div>

          <div>
            <div className="mb-1.5 text-[0.82em] font-semibold text-ink-muted">
              Live WCAG contrast (auto-corrected)
            </div>
            <div className="space-y-1.5">
              {resolved.pairs.map((p) => (
                <div
                  key={p.label}
                  className="flex items-center gap-2 rounded-token-sm border border-line bg-surface/40 px-2.5 py-1.5"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-sm border border-line"
                    style={{ background: p.bg }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8em]">{p.label}</span>
                  <span className="font-mono text-[0.75em] tabular-nums text-ink-muted">
                    {p.ratio.toFixed(2)}
                  </span>
                  <span
                    className={`flex items-center gap-0.5 text-[0.7em] font-bold ${p.pass ? 'text-ok' : 'text-bad'}`}
                  >
                    {p.pass ? <Check size={12} /> : <X size={12} />}
                    {p.required.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
              {resolved.chart.map((c, i) => (
                <span key={i} className="h-6 w-6 rounded-full border border-line" style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[0.82em] text-ink-muted">Presets:</span>
          {presets.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center overflow-hidden rounded-full border border-line"
            >
              <button
                className={`focus-ring h-7 px-2.5 text-[0.8em] ${p.id === theme.id ? 'bg-primary text-primary-on' : 'text-ink-muted hover:bg-surface hover:text-ink'}`}
                onClick={() => applyPreset(p.id)}
              >
                {p.name}
              </button>
              {p.id !== 'default' && (
                <button
                  className="focus-ring flex h-7 w-6 items-center justify-center text-ink-faint hover:text-bad"
                  aria-label={`Delete preset ${p.name}`}
                  onClick={() => removePreset(p.id)}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <Input
              placeholder="Save current as…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="h-8 w-40"
              aria-label="Preset name"
            />
            <Button
              size="sm"
              variant="soft"
              disabled={!saveName.trim()}
              onClick={() => {
                addPreset({ ...theme, id: uid(), name: saveName.trim() })
                setSaveName('')
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Download size={13} />}
              onClick={() => {
                const blob = new Blob([exportJSON()], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = 'elion-theme.json'
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Upload size={13} />}
              onClick={() => importRef.current?.click()}
            >
              Import
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const ok = importJSON(await f.text())
                if (!ok) alert('Could not parse theme JSON')
                e.target.value = ''
              }}
            />
          </span>
        </div>
        <p className="mt-2 text-[0.72em] text-ink-faint">
          A theme change propagates to every page — including Page & Edgeless modes and this editor’s chrome —
          within one render cycle. Only Lockdown presets may override per-session.
        </p>
      </Section>

      {/* ---------------- motion ---------------- */}
      <Section title="Motion" icon={<SlidersHorizontal size={15} />}>
        <Toggle
          label="Reduce motion"
          hint="Simplifies glow, interface motion, vinyl and companion animation. Also honors your system setting."
          checked={reducedMotion}
          onChange={setReducedMotion}
        />
      </Section>

      {/* ---------------- speech-to-text ---------------- */}

      <p className="mb-5 text-xs text-ink-muted">
        <a
          className="focus-ring underline"
          href={assetUrl('legal/notices.txt')}
          target="_blank"
          rel="noreferrer"
        >
          Third-party licences and source notices
        </a>
      </p>
      <Section title="Voice dictation" icon={<Mic size={15} />}>
        <VoiceSettings />
      </Section>

      {/* ---------------- distraction guard ---------------- */}
      <Section title="Distraction guard (Lockdown)" icon={<ShieldAlert size={15} />}>
        <Toggle
          label="Enable soft nudge"
          hint="If you alt-tab away during Lockdown for longer than the threshold, a nudge appears. This is a soft nudge — it cannot block other apps or websites (that would require elevated system permissions this build does not request)."
          checked={settings.guard.enabled}
          onChange={(v) => settings.setGuard({ enabled: v })}
        />
        <div className="mt-3 max-w-sm">
          <Slider
            label="Nudge after"
            value={settings.guard.thresholdMs / 1000}
            min={3}
            max={120}
            suffix="s"
            onChange={(v) => settings.setGuard({ thresholdMs: v * 1000 })}
          />
        </div>
        <Toggle
          label="Bring window back to front (desktop)"
          hint="On Windows/Electron, refocus the Lockdown window after the nudge."
          checked={settings.guard.bringToFront}
          onChange={(v) => settings.setGuard({ bringToFront: v })}
        />
      </Section>

      {/* ---------------- weather ---------------- */}
      <Section title="Weather" icon={<MapPin size={15} />}>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1 block text-[0.82em] text-ink-muted">City label</span>
            <Input
              value={settings.weather.city}
              className="w-40"
              onChange={(e) => settings.setWeather({ city: e.target.value })}
              aria-label="City"
            />
          </label>
          <label>
            <span className="mb-1 block text-[0.82em] text-ink-muted">Latitude</span>
            <Input
              type="number"
              step="0.01"
              value={settings.weather.lat}
              className="w-28"
              onChange={(e) => settings.setWeather({ lat: Number(e.target.value) })}
              aria-label="Latitude"
            />
          </label>
          <label>
            <span className="mb-1 block text-[0.82em] text-ink-muted">Longitude</span>
            <Input
              type="number"
              step="0.01"
              value={settings.weather.lon}
              className="w-28"
              onChange={(e) => settings.setWeather({ lon: Number(e.target.value) })}
              aria-label="Longitude"
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.geolocation?.getCurrentPosition(
                (pos) => settings.setWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => alert('Location unavailable')
              )
            }}
          >
            Use my location
          </Button>
        </div>
        <p className="mt-2 text-[0.75em] text-ink-faint">
          Source: Open-Meteo (no API key). Offline: the widget shows a clear unavailable state.
        </p>
      </Section>

      {/* ---------------- data ---------------- */}
      <Section title="Data" icon={<Info size={15} />}>
        <p className="mb-3 text-[0.82em] text-ink-muted">
          Everything (items, pages, snapshots, presets, sessions, blobs) lives in this browser’s IndexedDB.
          There is no cloud sync in this build.
        </p>
        <Button
          variant="danger"
          icon={<Trash2 size={14} />}
          onClick={async () => {
            if (
              !window.confirm(
                'Delete ALL local data (items, pages, presets, sessions)? This cannot be undone.'
              )
            )
              return
            await db.delete()
            window.location.reload()
          }}
        >
          Erase all data
        </Button>
      </Section>

      <div className="mt-6 rounded-token border border-line bg-surface/40 p-4 text-[0.8em] leading-relaxed text-ink-muted">
        <strong className="text-ink">Elion Suite v0.4</strong> — local-first personal productivity suite.
        <br />
        <span className="text-ink-faint">
          Known limitations: unsigned Windows build triggers SmartScreen; no cloud sync (local snapshots
          only); the distraction guard is a soft nudge, not OS-level enforcement; imported 3D scenes use
          built-in scenes only (no in-app .glb editor yet); automations are simple transition-triggered rules.
        </span>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  children
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-5 rounded-token-lg border border-line bg-raised p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-[0.95em] font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
