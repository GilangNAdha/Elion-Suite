import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  Lock, LogOut, Plus, Copy, Trash2, Play, Clock3,
  AlertTriangle, History, X, Settings2
} from 'lucide-react'
import type { LockdownPreset, WidgetInstance } from '../lib/types'
import { uid } from '../lib/types'
import { useLockdownStore } from '../stores/lockdownStore'
import { useThemeStore } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { deriveTheme, applyThemeCss } from '../tokens/theme'
import { Button, IconBtn, Input, Modal, Toaster, Menu, MenuItem } from '../components/ui'
import { Wallpaper } from '../components/lockdown/wallpaper'
import { WidgetLayer, type WidgetDef } from '../components/lockdown/widgets'
import { Mixer } from '../components/lockdown/Mixer'
import { FocusHistory } from '../components/lockdown/FocusHistory'
import { minutesLabel } from '../lib/time'

type Phase = 'landing' | 'active'

export function LockdownPage() {
  const navigate = useNavigate()
  const { presets, sessions, active, ready, createPreset, deletePreset, duplicatePreset, updatePreset, startSession, endSession, logInterruption, setWidget } =
    useLockdownStore()
  const [phase, setPhase] = useState<Phase>('landing')
  const [presetId, setPresetId] = useState<string | null>(null)
  const [objective, setObjective] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [customize, setCustomize] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [summary, setSummary] = useState<{ ms: number; interruptions: number; cycles: number } | null>(null)
  const [adding, setAdding] = useState<WidgetDef | null>(null)
  const guard = useSettingsStore((s) => s.guard)
  const guardTimer = useRef<number | null>(null)
  const cyclesRef = useRef(0)

  const preset = presets[presetId ?? '']
  const activePreset = active ? presets[active.presetId] : undefined

  const enterFullscreen = useCallback((): Promise<void> => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      return document.documentElement.requestFullscreen().catch(() => undefined)
    }
    return Promise.resolve()
  }, [])

  const exitFullscreen = useCallback((): Promise<void> => {
    if (document.fullscreenElement) return document.exitFullscreen().catch(() => undefined)
    return Promise.resolve()
  }, [])

  const begin = async (id: string) => {
    await enterFullscreen()
    startSession(id, objective.trim())
    setPhase('active')
  }

  const exit = useCallback(
    async (showSummary: boolean) => {
      const a = useLockdownStore.getState().active
      if (a && showSummary) {
        const ms = Date.now() - new Date(a.start).getTime()
        setSummary({ ms, interruptions: a.interruptions, cycles: cyclesRef.current })
      } else if (a) {
        await endSession(cyclesRef.current)
      }
      await exitFullscreen()
      // restore theme if the preset had an override
      if (a && useLockdownStore.getState().presets[a.presetId]?.themeOverride) {
        useThemeStore.getState().setTheme(useThemeStore.getState().presets[0] ? useThemeStore.getState().theme : useThemeStore.getState().theme)
      }
      navigate('/')
    },
    [endSession, exitFullscreen, navigate]
  )

  // ---- distraction guard (best-effort, §8.2) ----
  useEffect(() => {
    if (phase !== 'active' || !guard.enabled) return
    const threshold = guard.thresholdMs
    let blurred = false
    const onBlur = () => {
      blurred = true
      if (guardTimer.current) window.clearTimeout(guardTimer.current)
      guardTimer.current = window.setTimeout(() => {
        if (blurred) {
          setNudge(true)
          logInterruption()
          const elion = (window as unknown as { elion?: { bringToFront?: () => void } }).elion
          if (guard.bringToFront && elion?.bringToFront) elion.bringToFront()
          guardTimer.current = window.setTimeout(() => setNudge(false), 8000)
        }
      }, threshold)
    }
    const onFocus = () => {
      blurred = false
      if (guardTimer.current) window.clearTimeout(guardTimer.current)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    // Electron main-side nudge (mirrors the same behavior)
    const elion = (window as unknown as { elion?: { onNudge?: (cb: () => void) => (() => void) | void } }).elion
    const offNudge = elion?.onNudge?.(() => {
      setNudge(true)
      logInterruption()
      window.setTimeout(() => setNudge(false), 8000)
    })
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      if (guardTimer.current) window.clearTimeout(guardTimer.current)
      if (typeof offNudge === 'function') offNudge()
    }
  }, [phase, guard, logInterruption])

  // ---- theme override for the session ----
  useEffect(() => {
    if (phase !== 'active' || !activePreset?.themeOverride) return
    const p = useThemeStore.getState().presets.find((x) => x.id === activePreset.themeOverride)
    if (p) useThemeStore.getState().setTheme({ ...p })
  }, [phase, activePreset?.themeOverride])

  // ---- widget drag persistence ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const onWidgetDragEnd = (e: DragEndEvent) => {
    if (!active || !e.active.data.current?.widget) return
    const w = e.active.data.current.widget as WidgetInstance
    const nx = Math.max(0, w.x + e.delta.x)
    const ny = Math.max(0, w.y + e.delta.y)
    void setWidget(active.presetId, { ...w, x: nx, y: ny })
  }

  const presetsList = useMemo(() => Object.values(presets).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [presets])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-ink">
        <div className="text-ink-faint">Loading Lockdown…</div>
      </div>
    )
  }

  // ================= LANDING =================
  if (phase === 'landing') {
    return (
      <div className="relative h-full overflow-y-auto bg-bg text-ink">
        <div className="mx-auto max-w-4xl p-8 pb-24">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-token bg-primary-soft text-primary">
              <Lock size={22} />
            </span>
            <div>
              <h1 className="text-[1.7em] font-bold tracking-tight">Lockdown Mode</h1>
              <p className="text-[0.9em] text-ink-muted">
                Full-screen focus. Pick a preset, set an objective, and lock in.
              </p>
            </div>
            <span className="flex-1" />
            <Button variant="outline" icon={<History size={14} />} onClick={() => setHistoryOpen(true)}>
              Focus history
            </Button>
          </div>

          <label className="mb-6 block max-w-xl">
            <span className="mb-1.5 block text-[0.8em] font-semibold text-ink-muted">What are you working on?</span>
            <Input
              placeholder="e.g. Draft the Q4 proposal, 25-minute deep work…"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              aria-label="Session objective"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {presetsList.map((p) => (
              <div key={p.id} className="elev-raised group relative rounded-token-lg border border-line bg-raised p-4">
                <PresetPreview p={p} />
                <div className="mt-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-[1em] font-semibold">{p.name}</div>
                    <div className="text-[0.72em] text-ink-faint">
                      {p.wallpaper.tier === 'scene3d' ? '3D scene' : p.wallpaper.tier === 'video' ? 'Video' : 'Wallpaper'} · {p.pomodoro.workMin}′ focus
                    </div>
                  </div>
                  <Button variant="primary" size="sm" icon={<Play size={13} />} onClick={() => { setPresetId(p.id); void begin(p.id) }}>
                    Start
                  </Button>
                </div>
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Menu
                    width={160}
                    align="end"
                    trigger={
                      <span className="focus-ring flex h-7 w-7 items-center justify-center rounded-token-sm bg-sunken text-ink-faint hover:text-ink" aria-label={`Preset actions ${p.name}`}>
                        ⋯
                      </span>
                    }
                  >
                    <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={() => void duplicatePreset(p.id)} />
                    <MenuItem icon={<Settings2 size={13} />} label="Edit (in customize)" onClick={() => setPresetId(p.id)} />
                    <MenuItem icon={<Trash2 size={13} />} label="Delete" danger onClick={() => void deletePreset(p.id)} />
                  </Menu>
                </div>
              </div>
            ))}
            <button
              className="focus-ring flex min-h-40 flex-col items-center justify-center gap-2 rounded-token-lg border border-dashed border-line text-ink-faint hover:border-primary hover:text-primary"
              onClick={async () => {
                const name = window.prompt('Preset name', 'New preset')
                if (name?.trim()) {
                  const p = await createPreset(name.trim())
                  setPresetId(p.id)
                }
              }}
            >
              <Plus size={20} />
              <span className="text-[0.85em]">New preset</span>
            </button>
          </div>

          {preset && (
            <PresetEditor preset={preset} onDone={() => setPresetId(null)} />
          )}

          <p className="mt-8 max-w-xl text-[0.78em] leading-relaxed text-ink-faint">
            The optional distraction guard is a <strong>soft nudge</strong> — it cannot block other apps or websites at
            the OS level (that would require elevated permissions this build does not request).
          </p>
        </div>
        {historyOpen && <FocusHistory onClose={() => setHistoryOpen(false)} />}
        <Toaster />
      </div>
    )
  }

  // ================= ACTIVE SESSION =================
  if (!active || !activePreset) return null
  return (
    <DndContext sensors={sensors} onDragEnd={onWidgetDragEnd}>
      <div className="relative h-full overflow-hidden bg-sunken text-ink" style={{ colorScheme: 'dark' }}>
        <Wallpaper config={activePreset.wallpaper} />

        {/* HUD top-right */}
        <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
          <SessionClock start={active.start} />
          {active.objective && (
            <span className="glass-panel max-w-60 truncate rounded-full border border-line px-3 py-1.5 text-[0.8em] text-ink-muted">
              {active.objective}
            </span>
          )}
          <IconBtn label="Customize widgets" active={customize} className="glass-panel" onClick={() => setCustomize((c) => !c)}>
            <Settings2 size={16} />
          </IconBtn>
          <Button variant="outline" size="sm" className="glass-panel" icon={<LogOut size={13} />} onClick={() => void exit(true)}>
            Exit Lockdown
          </Button>
        </div>

        {/* widget layer */}
        <WidgetLayer
          preset={activePreset}
          customize={customize}
          onAdd={(def) => {
            const w: WidgetInstance = {
              id: uid(),
              type: def.type,
              x: 80 + (activePreset.widgets.length % 4) * 300,
              y: 80 + (activePreset.widgets.length % 3) * 200,
              w: def.w,
              h: def.h
            }
            void setWidget(activePreset.id, w)
            setAdding(null)
          }}
          adding={adding}
          setAdding={setAdding}
          sessions={sessions}
        />

        {/* mixer */}
        <Mixer preset={activePreset} />

        {/* ambient embed (degrades offline) */}
        {activePreset.ambientEmbedUrl && (
          <div className="glass-panel absolute bottom-3 left-3 z-30 w-80 overflow-hidden rounded-token border border-line">
            <div className="flex items-center justify-between px-3 py-1.5 text-[0.78em] text-ink-muted">
              Ambient
              <button className="focus-ring rounded p-0.5 hover:text-ink" aria-label="Hide ambient embed" onClick={() => void updatePreset(activePreset.id, { ambientEmbedUrl: undefined })}>
                <X size={12} />
              </button>
            </div>
            <iframe
              title="Ambient embed"
              src={activePreset.ambientEmbedUrl}
              className="h-36 w-full border-0"
              allow="autoplay; encrypted-media"
            />
          </div>
        )}

        {/* guard nudge */}
        {nudge && (
          <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="elev-overlay flex items-center gap-3 rounded-token-lg border border-warn/50 bg-raised px-4 py-3">
              <AlertTriangle size={18} className="text-warn" />
              <span className="text-[0.92em]">Still locked down?</span>
              <Button size="sm" variant="soft" onClick={() => setNudge(false)}>
                Stay
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void exit(false)}>
                Exit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* session summary */}
      <Modal
        open={summary !== null}
        onClose={() => void exit(false)}
        title="Session complete"
        footer={
          <Button variant="primary" onClick={() => void exit(false)}>
            Back to Elion
          </Button>
        }
      >
        {summary && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-token bg-surface/50 p-4">
              <div className="text-[1.8em] font-bold tabular-nums" style={{ fontSize: 'var(--metric-size, 1.8em)' }}>
                {minutesLabel(summary.ms)}
              </div>
              <div className="text-[0.75em] text-ink-faint">focused</div>
            </div>
            <div className="rounded-token bg-surface/50 p-4">
              <div className="text-[1.8em] font-bold tabular-nums">{summary.cycles}</div>
              <div className="text-[0.75em] text-ink-faint">pomodoro cycles</div>
            </div>
            <div className="rounded-token bg-surface/50 p-4">
              <div className="text-[1.8em] font-bold tabular-nums">{summary.interruptions}</div>
              <div className="text-[0.75em] text-ink-faint">interruptions</div>
            </div>
          </div>
        )}
        <p className="mt-3 text-center text-[0.8em] text-ink-faint">
          Saved to Focus history and your Profile stats.
        </p>
      </Modal>
      <Toaster position="top" />
    </DndContext>
  )
}

function SessionClock({ start }: { start: string }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = Date.now() - new Date(start).getTime()
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return (
    <span className="glass-panel flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[0.85em] tabular-nums">
      <Clock3 size={13} className="text-primary" />
      {`${Math.floor(m / 60) > 0 ? Math.floor(m / 60) + ':' : ''}${`${m % 60}`.padStart(2, '0')}:${`${s}`.padStart(2, '0')}`}
    </span>
  )
}

function PresetPreview({ p }: { p: LockdownPreset }) {
  const theme = useThemeStore((s) => s.theme)
  const reduced = useThemeStore((s) => s.reducedMotion)
  const [url, setUrl] = useState<string | null>(null)
  const blobId = p.wallpaper.tier === 'static' || p.wallpaper.tier === 'video' ? p.wallpaper.blobId : undefined
  useEffect(() => {
    let alive = true
    let u: string | null = null
    if (blobId) {
      void useLockdownStore.getState().getBlob(blobId).then((b) => {
        if (!alive || !b) return
        u = URL.createObjectURL(b.data)
        if (alive) setUrl(u)
      })
    }
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [blobId])

  if (p.wallpaper.tier === 'scene3d') {
    return (
      <div
        className="relative h-24 overflow-hidden rounded-token"
        style={{ background: 'linear-gradient(135deg, var(--c1), var(--c2) 55%, var(--c5))', opacity: 0.85 }}
      >
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.25), transparent 45%)' }} />
        <span className="absolute bottom-1.5 right-2 rounded-sm bg-black/30 px-1.5 py-0.5 text-[0.62em] font-semibold text-white">
          3D · {p.wallpaper.scene ?? 'particles'}
        </span>
        {reduced && (
          <span className="absolute bottom-1.5 left-2 rounded-sm bg-black/30 px-1.5 py-0.5 text-[0.62em] text-white">static fallback</span>
        )}
      </div>
    )
  }
  return (
    <div className="relative h-24 overflow-hidden rounded-token bg-sunken">
      {url ? (
        p.wallpaper.tier === 'video' ? (
          <video src={url} muted loop autoPlay className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt="" className="h-full w-full object-cover" />
        )
      ) : (
        <div
          className="h-full w-full"
          style={{
            background: `linear-gradient(120deg, ${theme.seed.h} 30%, hsl(${theme.seed.h} 50% 20%) 60%, hsl(${(theme.seed.h + 40) % 360} 45% 30%))`,
            filter: 'hue-rotate(0deg)'
          }}
        />
      )}
      {!url && (
        <span className="absolute bottom-1.5 right-2 rounded-sm bg-black/30 px-1.5 py-0.5 text-[0.62em] font-semibold text-white">
          Built-in wallpaper
        </span>
      )}
    </div>
  )
}

function PresetEditor({ preset, onDone }: { preset: LockdownPreset; onDone: () => void }) {
  const updatePreset = useLockdownStore((s) => s.updatePreset)
  const putBlob = useLockdownStore((s) => s.putBlob)
  const presetsThemes = useThemeStore((s) => s.presets)
  const [name, setName] = useState(preset.name)
  const [tier, setTier] = useState(preset.wallpaper.tier)
  const [scene, setScene] = useState(preset.wallpaper.scene ?? 'particles')
  const [embed, setEmbed] = useState(preset.ambientEmbedUrl ?? '')
  const [themeOverride, setThemeOverride] = useState(preset.themeOverride ?? '')

  return (
    <div className="elev-raised mt-6 rounded-token-lg border border-line bg-raised p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[1.1em] font-semibold">Edit preset</h2>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[0.8em] text-ink-muted">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Preset name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.8em] text-ink-muted">Theme override (optional)</span>
          <select
            className="focus-ring h-9 w-full rounded-token-sm border border-line bg-surface/60 px-2.5"
            value={themeOverride}
            onChange={(e) => setThemeOverride(e.target.value)}
            aria-label="Theme override"
          >
            <option value="">Use current theme</option>
            {presetsThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-[0.8em] text-ink-muted">Wallpaper</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="focus-ring h-9 rounded-token-sm border border-line bg-surface/60 px-2.5"
              value={tier}
              onChange={(e) => setTier(e.target.value as typeof tier)}
              aria-label="Wallpaper tier"
            >
              <option value="static">Static image</option>
              <option value="video">Looping video</option>
              <option value="scene3d">3D scene</option>
            </select>
            {tier === 'scene3d' && (
              <select
                className="focus-ring h-9 rounded-token-sm border border-line bg-surface/60 px-2.5"
                value={scene}
                onChange={(e) => setScene(e.target.value as typeof scene)}
                aria-label="3D scene"
              >
                <option value="particles">Particle field</option>
                <option value="gradient">Gradient mesh</option>
                <option value="orbit">Orbit shape</option>
              </select>
            )}
            {tier !== 'scene3d' && (
              <label className="cursor-pointer text-[0.82em] text-ink-muted hover:text-ink">
                Upload…
                <input
                  type="file"
                  accept={tier === 'video' ? 'video/*' : 'image/*'}
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const id = uid()
                    await putBlob({ id, kind: tier === 'video' ? 'video' : 'wallpaper', name: f.name, data: f })
                    void updatePreset(preset.id, { wallpaper: { ...preset.wallpaper, tier, blobId: id, videoMuted: true } })
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[0.8em] text-ink-muted">Ambient embed URL (YouTube/Spotify embed)</span>
          <Input value={embed} onChange={(e) => setEmbed(e.target.value)} placeholder="https://www.youtube.com/embed/…" aria-label="Ambient embed URL" />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            void updatePreset(preset.id, {
              name: name.trim() || preset.name,
              wallpaper: { ...preset.wallpaper, tier, scene: tier === 'scene3d' ? scene : preset.wallpaper.scene },
              ambientEmbedUrl: embed.trim() || undefined,
              themeOverride: themeOverride || undefined
            })
            onDone()
          }}
        >
          Save preset
        </Button>
      </div>
    </div>
  )
}

