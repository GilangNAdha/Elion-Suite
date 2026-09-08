import { assetUrl } from '../lib/assets'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  History,
  Lock,
  LogOut,
  Maximize,
  Plus,
  Settings2,
  Shield,
  Swords,
  Trash2,
  X
} from 'lucide-react'
import type { AuroraTheme, LockdownPreset, WidgetInstance } from '../lib/types'
import { uid } from '../lib/types'
import { useLockdownStore } from '../stores/lockdownStore'
import { useThemeStore } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePetStore } from '../stores/petStore'
import { Button, IconBtn, Input, Modal, StatusPill, Toaster, useToasts } from '../components/ui'
import { Wallpaper } from '../components/lockdown/wallpaper'
import { useReducedMotion } from '../lib/useReducedMotion'
import { WidgetLayer, type WidgetDef } from '../components/lockdown/widgets'
import { FocusTimer, FocusTimerEngine } from '../components/lockdown/FocusTimer'
import { Mixer } from '../components/lockdown/Mixer'
import { FocusHistory } from '../components/lockdown/FocusHistory'
import { MusicCard } from '../components/music/Turntable'
import { minutesLabel } from '../lib/time'

type Summary = { ms: number; interruptions: number; cycles: number }

export function LockdownPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    presets,
    sessions,
    active,
    ready,
    createPreset,
    deletePreset,
    duplicatePreset,
    updatePreset,
    startSession,
    endSession,
    logInterruption,
    setWidget
  } = useLockdownStore()
  const [presetId, setPresetId] = useState<string | null>(null)
  const [objective, setObjective] = useState(
    () => (location.state as { objective?: string } | null)?.objective ?? ''
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [customize, setCustomize] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [adding, setAdding] = useState<WidgetDef | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [entering, setEntering] = useState(false)
  const guard = useSettingsStore((s) => s.guard)
  const previousTheme = useRef<AuroraTheme | null>(null)
  const reduced = useReducedMotion()
  const list = Object.values(presets).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)
  )
  const preset = presets[presetId ?? ''] ?? list[0]
  const activePreset = active ? presets[active.presetId] : undefined
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  )

  const restoreTheme = useCallback(() => {
    if (previousTheme.current) {
      useThemeStore.getState().setTheme(previousTheme.current)
      previousTheme.current = null
    }
  }, [])
  useEffect(() => () => restoreTheme(), [restoreTheme])

  const enterFullscreen = async () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return
    await document.documentElement.requestFullscreen().catch(() => undefined)
  }
  const begin = async () => {
    if (!preset || entering || active) return
    setEntering(true)
    await enterFullscreen()
    if (preset.themeOverride) {
      const store = useThemeStore.getState()
      const override = store.presets.find((p) => p.id === preset.themeOverride)
      if (override) {
        previousTheme.current = store.theme
        store.setTheme(override)
      }
    }
    const change = () => startSession(preset.id, objective.trim())
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> }
    }
    if (!reduced && doc.startViewTransition) {
      document.documentElement.dataset.transition = 'lockdown'
      const transition = doc.startViewTransition(change)
      void transition.finished.finally(() => delete document.documentElement.dataset.transition)
    } else change()
    setEntering(false)
  }

  const finish = async () => {
    if (finishing) return
    const state = useLockdownStore.getState()
    if (!state.active) return
    const result = {
      ms: Date.now() - new Date(state.active.start).getTime(),
      interruptions: state.active.interruptions,
      cycles: state.timer.cyclesDone
    }
    setFinishing(true)
    try {
      await endSession(result.cycles)
      restoreTheme()
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      setSummary(result)
      setCustomize(false)
    } catch {
      useToasts.getState().push('Session could not be saved — keep this page open and try again.', 'error')
    } finally {
      setFinishing(false)
    }
  }

  // A soft nudge, never OS-level enforcement. Disabled outside a live session.
  useEffect(() => {
    if (!active || !guard.enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const blur = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setNudge(true)
        logInterruption()
        const desktop = (window as unknown as { elion?: { bringToFront?: () => void } }).elion
        if (guard.bringToFront) desktop?.bringToFront?.()
      }, guard.thresholdMs)
    }
    const focus = () => clearTimeout(timer)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
    }
  }, [active?.start, guard.enabled, guard.thresholdMs, guard.bringToFront, logInterruption])

  const onWidgetDragEnd = (event: DragEndEvent) => {
    if (!active || !event.active.data.current?.widget) return
    const widget = event.active.data.current.widget as WidgetInstance
    void setWidget(active.presetId, {
      ...widget,
      x: Math.max(0, Math.min(window.innerWidth - widget.w, widget.x + event.delta.x)),
      y: Math.max(64, Math.min(window.innerHeight - widget.h, widget.y + event.delta.y))
    })
  }

  if (!ready)
    return (
      <div className="focus-loading" role="status">
        Preparing your focus space…
      </div>
    )

  return (
    <>
      {active && activePreset ? (
        <DndContext sensors={sensors} onDragEnd={onWidgetDragEnd}>
          <div className="lockdown-stage">
            <Wallpaper config={activePreset.wallpaper} />
            <div className="wallpaper-shade" aria-hidden="true" />
            <FocusTimerEngine preset={activePreset} />
            <header className="focus-hud">
              <div className="focus-state">
                <StatusPill color="var(--ok)" label="Lockdown active" />
                <span className="focus-preset-badge glass-panel">{activePreset.name}</span>
              </div>
              <div className="focus-hud-tools">
                <IconBtn label="Enter fullscreen" onClick={() => void enterFullscreen()}>
                  <Maximize size={16} />
                </IconBtn>
                <Button
                  size="sm"
                  icon={<Settings2 size={14} />}
                  onClick={() => {
                    if (customize) void updatePreset(activePreset.id, { layout: 'free' })
                    setCustomize((v) => !v)
                  }}
                >
                  {customize ? 'Save layout' : 'Customize widgets'}
                </Button>
              </div>
            </header>
            {!customize && activePreset.layout !== 'free' ? (
              <>
                <main className="focus-center">
                  <FocusTimer preset={activePreset} objective={active.objective} />
                  <div className="focus-music glass-panel">
                    <MusicCard compact />
                  </div>
                </main>
              </>
            ) : (
              <>
                <WidgetLayer
                  preset={activePreset}
                  customize={customize}
                  onAdd={(def) => {
                    const widget: WidgetInstance = {
                      id: uid(),
                      type: def.type,
                      x: Math.min(300, Math.max(0, window.innerWidth - def.w)),
                      y: 100,
                      w: def.w,
                      h: def.h
                    }
                    void setWidget(activePreset.id, widget)
                    setAdding(null)
                  }}
                  adding={adding}
                  setAdding={setAdding}
                  sessions={sessions}
                />
                <button
                  className="restore-quiet-layout glass-panel"
                  onClick={() => {
                    void updatePreset(activePreset.id, { layout: 'centered' })
                    setCustomize(false)
                  }}
                >
                  Restore quiet layout
                </button>
              </>
            )}
            <div className="focus-exit">
              <Button
                size="sm"
                icon={<LogOut size={13} />}
                disabled={finishing}
                onClick={() => void finish()}
              >
                {finishing ? 'Saving session…' : 'Exit Lockdown'}
              </Button>
            </div>
            <Mixer preset={activePreset} />
            {activePreset.ambientEmbedUrl && customize && (
              <div className="focus-ambient glass-panel">
                <iframe
                  title="Ambient media"
                  src={activePreset.ambientEmbedUrl}
                  allow="autoplay; encrypted-media"
                />
              </div>
            )}
            {nudge && (
              <div className="focus-nudge glass-panel" role="status">
                <Shield size={18} />
                <span>Ready to return to your objective?</span>
                <Button size="sm" onClick={() => setNudge(false)}>
                  Continue focus
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void finish()}>
                  Exit Lockdown
                </Button>
              </div>
            )}
          </div>
        </DndContext>
      ) : (
        <div className="focus-landing">
          <header className="focus-landing-header">
            <button className="text-action" onClick={() => navigate('/')}>
              <ArrowLeft size={15} />
              Back to dashboard
            </button>
            <Button
              size="sm"
              variant="ghost"
              icon={<History size={14} />}
              onClick={() => setHistoryOpen(true)}
            >
              Focus history
            </Button>
          </header>
          <div className="focus-setup-layout">
            <div className="focus-setup">
              <div className="focus-mark">
                <Lock size={22} strokeWidth={1.5} />
              </div>
              <h1>
                Everything else
                <br />
                can wait.
              </h1>
              <p>
                One objective. A quiet space.
                <br />
                Make some room for your best work.
              </p>
              <label className="focus-objective-field">
                <span>What are you working on?</span>
                <Input
                  placeholder="Give this session a purpose"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  aria-label="Session objective"
                  maxLength={180}
                />
              </label>
              <div className="preset-selection">
                <span className="setup-label">Choose your atmosphere</span>
                {list.map((p) => (
                  <div className={`preset-choice ${preset?.id === p.id ? 'is-selected' : ''}`} key={p.id}>
                    <button
                      className="preset-choice-main"
                      aria-pressed={preset?.id === p.id}
                      onClick={() => setPresetId(p.id)}
                    >
                      <span className="preset-thumbnail">
                        <img src={assetUrl(`wallpapers/${p.wallpaper.builtin ?? 'nocturne'}.jpg`)} alt="" />
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.pomodoro.workMin} min focus, {p.pomodoro.breakMin} min break
                        </small>
                      </span>
                      {preset?.id === p.id && <Check size={15} />}
                    </button>
                    <IconBtn
                      label={`Edit ${p.name} preset`}
                      onClick={() => {
                        setPresetId(p.id)
                        setEditorOpen(true)
                      }}
                    >
                      <Settings2 size={14} />
                    </IconBtn>
                  </div>
                ))}
              </div>
              {preset && (
                <div className="focus-duration">
                  <span className="setup-label">Focus interval</span>
                  <div>
                    {[25, 50, 90].map((duration) => (
                      <button
                        key={duration}
                        aria-pressed={preset.pomodoro.workMin === duration}
                        onClick={() =>
                          void updatePreset(preset.id, {
                            pomodoro: { ...preset.pomodoro, workMin: duration }
                          })
                        }
                      >
                        <b>{duration}</b> min
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="focus-setup-actions">
                <Button icon={<Lock size={14} />} disabled={!preset || entering} onClick={() => void begin()}>
                  {entering ? 'Preparing session…' : 'Start focus session'}
                </Button>
                <button
                  className="text-action"
                  onClick={async () => {
                    const p = await createPreset('My focus space')
                    setPresetId(p.id)
                    setEditorOpen(true)
                  }}
                >
                  <Plus size={13} />
                  New preset
                </button>
              </div>
              <p className="guard-disclosure">
                <Shield size={13} />
                <span>
                  The distraction guard is a gentle nudge, not an app or website blocker. You’re always in
                  control.
                </span>
              </p>
            </div>
            <div className="focus-preview" aria-label="Preview of your focus space">
              {preset ? (
                <Wallpaper config={preset.wallpaper} />
              ) : (
                <img className="wallpaper-image" src={assetUrl('wallpapers/nocturne.jpg')} alt="" />
              )}
              <div className="wallpaper-shade" aria-hidden="true" />
              <span className="focus-preview-label">Your quiet space</span>
              <div className="preview-timer">
                <span>Time to settle in</span>
                <strong>{String(preset?.pomodoro.workMin ?? 25).padStart(2, '0')}:00</strong>
                <p>{objective || 'One thing at a time.'}</p>
                <span className="preview-rule" />
              </div>
              <div className="preview-caption">
                <span>{preset?.name ?? 'Nocturne'}</span>
                <span>
                  {preset?.wallpaper.tier === 'scene3d'
                    ? '3D atmosphere'
                    : preset?.wallpaper.tier === 'video'
                      ? 'Video wallpaper'
                      : 'Still wallpaper'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {editorOpen && preset && (
        <Modal open title="Customize focus preset" width={700} onClose={() => setEditorOpen(false)}>
          <PresetEditor key={preset.id} preset={preset} onDone={() => setEditorOpen(false)} />
          <div className="preset-management">
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy size={13} />}
              onClick={async () => {
                const copy = await duplicatePreset(preset.id)
                if (copy) setPresetId(copy.id)
              }}
            >
              Duplicate preset
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={13} />}
              onClick={() => {
                if (window.confirm(`Delete “${preset.name}”?`)) {
                  void deletePreset(preset.id)
                  setEditorOpen(false)
                  setPresetId(null)
                }
              }}
            >
              Delete preset
            </Button>
          </div>
        </Modal>
      )}
      <Modal
        open={summary !== null}
        title="Session saved"
        onClose={() => {
          setSummary(null)
          navigate('/')
        }}
        footer={
          <Button
            onClick={() => {
              setSummary(null)
              navigate('/')
            }}
          >
            Back to dashboard
          </Button>
        }
      >
        {summary && (
          <div className="session-summary">
            <div>
              <strong className="metric">{minutesLabel(summary.ms)}</strong>
              <span>Session time</span>
            </div>
            <div>
              <strong className="metric">{summary.cycles}</strong>
              <span>Focus intervals</span>
            </div>
            <div>
              <strong className="metric">{summary.interruptions}</strong>
              <span>Interruptions</span>
            </div>
          </div>
        )}
        <p className="summary-note">
          Saved to Focus history and your Profile. A little progress is still progress.
        </p>
      </Modal>
      {historyOpen && <FocusHistory onClose={() => setHistoryOpen(false)} />}
      <Toaster position={active ? 'top' : 'bottom'} />
    </>
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
  const [pomodoro, setPomodoro] = useState(preset.pomodoro)

  return (
    <div className="preset-editor">
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
                    await putBlob({
                      id,
                      kind: tier === 'video' ? 'video' : 'wallpaper',
                      name: f.name,
                      data: f
                    })
                    void updatePreset(preset.id, {
                      wallpaper: { ...preset.wallpaper, tier, blobId: id, videoMuted: true }
                    })
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:col-span-2">
          {(
            [
              { key: 'workMin', label: 'Focus minutes', max: 180 },
              { key: 'breakMin', label: 'Break minutes', max: 60 },
              { key: 'goalCycles', label: 'Intervals', max: 12 }
            ] as const
          ).map(({ key, label, max }) => (
            <label key={key}>
              <span className="text-xs text-ink-muted">{label}</span>
              <Input
                type="number"
                min={1}
                max={max}
                value={pomodoro[key]}
                aria-label={label}
                onChange={(e) =>
                  setPomodoro({ ...pomodoro, [key]: Math.min(max, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </label>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-[0.8em] text-ink-muted">
            Ambient embed URL (YouTube/Spotify embed)
          </span>
          <Input
            value={embed}
            onChange={(e) => setEmbed(e.target.value)}
            placeholder="https://www.youtube.com/embed/…"
            aria-label="Ambient embed URL"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            void updatePreset(preset.id, {
              name: name.trim() || preset.name,
              pomodoro,
              wallpaper: {
                ...preset.wallpaper,
                tier,
                scene: tier === 'scene3d' ? scene : preset.wallpaper.scene
              },
              ambientEmbedUrl: embed.trim() || undefined,
              themeOverride: themeOverride || undefined
            })
            useToasts.getState().push('Changes saved', 'success')
            onDone()
          }}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
