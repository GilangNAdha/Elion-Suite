import { useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  Clock3, Timer, Music2, NotebookPen, Sparkles, CloudSun,
  GripVertical, X, Play, Pause, SkipForward, Plus, Volume2
} from 'lucide-react'
import type { FocusSession, LockdownPreset, WidgetInstance } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { useMusicStore } from '../../stores/musicStore'
import { usePetStore } from '../../stores/petStore'
import { usePagesStore } from '../../stores/pagesStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { playChime } from '../../lib/audio'
import { IconBtn, Button } from '../ui'
import { Pet } from '../pet/Pet'

export interface WidgetDef {
  type: WidgetInstance['type']
  label: string
  icon: typeof Clock3
  w: number
  h: number
}

export const WIDGET_DEFS: WidgetDef[] = [
  { type: 'clock', label: 'Clock', icon: Clock3, w: 230, h: 120 },
  { type: 'timer', label: 'Timer / Pomodoro', icon: Timer, w: 280, h: 220 },
  { type: 'music', label: 'Music', icon: Music2, w: 280, h: 130 },
  { type: 'notes', label: 'Notes', icon: NotebookPen, w: 300, h: 260 },
  { type: 'pet', label: 'Pet', icon: Sparkles, w: 180, h: 170 },
  { type: 'weather', label: 'Weather', icon: CloudSun, w: 240, h: 130 }
]

export function WidgetLayer({
  preset,
  customize,
  onAdd,
  adding,
  setAdding,
  sessions
}: {
  preset: LockdownPreset
  customize: boolean
  onAdd: (def: WidgetDef) => void
  adding: WidgetDef | null
  setAdding: (d: WidgetDef | null) => void
  sessions: FocusSession[]
}) {
  const removeWidget = useLockdownStore((s) => s.removeWidget)
  const setWidget = useLockdownStore((s) => s.setWidget)

  return (
    <div className="absolute inset-0 z-10">
      {preset.widgets.map((w) => {
        const def = WIDGET_DEFS.find((d) => d.type === w.type)
        if (!def) return null
        return (
          <WidgetFrame
            key={w.id}
            w={w}
            def={def}
            customize={customize}
            preset={preset}
            sessions={sessions}
            onClose={() => void removeWidget(preset.id, w.id)}
            onResize={(nw, nh) => void setWidget(preset.id, { ...w, w: nw, h: nh })}
          />
        )
      })}

      {customize && (
        <div className="absolute left-3 top-3 z-30">
          <div className="glass-panel elev-overlay rounded-token-lg border border-line p-2">
            <div className="mb-1.5 px-1 text-[0.72em] font-semibold uppercase tracking-wider text-ink-faint">
              Add widget
            </div>
            <div className="flex flex-col gap-1">
              {WIDGET_DEFS.map((d) => (
                <button
                  key={d.type}
                  className={`focus-ring flex items-center gap-2 rounded-token-sm px-2 py-1.5 text-[0.85em] ${
                    adding?.type === d.type ? 'bg-primary text-primary-on' : 'text-ink-muted hover:bg-surface hover:text-ink'
                  }`}
                  onClick={() => (adding?.type === d.type ? onAdd(d) : setAdding(d))}
                  title={adding?.type === d.type ? 'Click again to place' : d.label}
                >
                  <Plus size={13} />
                  <d.icon size={14} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WidgetFrame({
  w,
  def,
  customize,
  preset,
  sessions,
  onClose,
  onResize
}: {
  w: WidgetInstance
  def: WidgetDef
  customize: boolean
  preset: LockdownPreset
  sessions: FocusSession[]
  onClose: () => void
  onResize: (nw: number, nh: number) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `widget:${w.id}`,
    data: { widget: w }
  })
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  return (
    <div
      className={`glass-panel absolute rounded-token-lg border border-line bg-raised/90 ${isDragging ? 'z-40 shadow-xl' : 'z-10'}`}
      style={{ left: w.x, top: w.y, width: w.w, minHeight: w.h }}
    >
      <div
        className="flex items-center gap-1 border-b border-line/60 px-2 py-1"
        {...listeners}
        {...attributes}
        role="button"
        aria-label={`Move ${def.label} widget`}
      >
        <span className="cursor-grab text-ink-faint active:cursor-grabbing">
          <GripVertical size={12} />
        </span>
        <def.icon size={13} className="text-primary" />
        <span className="flex-1 truncate text-[0.78em] font-semibold text-ink-muted">{def.label}</span>
        {customize && (
          <button className="focus-ring rounded p-0.5 text-ink-faint hover:text-bad" aria-label={`Remove ${def.label} widget`} onClick={onClose}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="p-2" style={{ minHeight: w.h - 34 }}>
        {w.type === 'clock' && <ClockWidget />}
        {w.type === 'timer' && <TimerWidget preset={preset} />}
        {w.type === 'music' && <MusicWidget />}
        {w.type === 'notes' && <NotesWidget />}
        {w.type === 'pet' && <PetWidget />}
        {w.type === 'weather' && <WeatherWidget />}
      </div>
      {customize && (
        <div
          role="button"
          aria-label={`Resize ${def.label} widget`}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          onPointerDown={(e) => {
            e.preventDefault()
            resizeRef.current = { x: e.clientX, y: e.clientY, w: w.w, h: w.h }
            const onMove = (ev: PointerEvent) => {
              const r = resizeRef.current
              if (!r) return
              onResize(
                Math.max(180, r.w + ev.clientX - r.x),
                Math.max(120, r.h + ev.clientY - r.y)
              )
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
              resizeRef.current = null
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
        >
          <div className="absolute bottom-1 right-1 h-2 w-2 rounded-sm bg-ink-faint" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const angle = (now.getMinutes() / 60) * 360
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0" aria-hidden>
        <circle cx="50" cy="50" r="47" fill="var(--sunken)" stroke="var(--line-strong)" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1="7"
            x2="50"
            y2="12"
            stroke="var(--ink-faint)"
            strokeWidth="2"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line x1="50" y1="50" x2="50" y2="26" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${(now.getHours() % 12) * 30 + now.getMinutes() / 2} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="16" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${angle} 50 50)`} />
        <circle cx="50" cy="50" r="3" fill="var(--primary)" />
      </svg>
      <div>
        <div className="font-mono text-[1.5em] font-semibold tabular-nums leading-none">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="mt-1 text-[0.75em] text-ink-muted">
          {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

function TimerWidget({ preset }: { preset: LockdownPreset }) {
  const timer = useLockdownStore((s) => s.timer)
  const setTimer = useLockdownStore((s) => s.setTimer)
  const active = useLockdownStore((s) => s.active)
  const cfg = preset.pomodoro
  const [left, setLeft] = useState(cfg.workMin * 60)

  useEffect(() => {
    if (!timer.running || !timer.endsAt) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timer.endsAt! - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining <= 0 && timer.endsAt) {
        if (timer.phase === 'work') {
          const cycles = timer.cyclesDone + 1
          playChime('transition')
          if (cycles >= cfg.goalCycles) {
            playChime('break')
            setTimer({ phase: 'idle', endsAt: null, running: false, cyclesDone: cycles })
            useLockdownStore.getState().setTimer({ phase: 'idle', endsAt: null, running: false, cyclesDone: cycles })
          } else {
            setTimer({ phase: 'break', endsAt: Date.now() + cfg.breakMin * 60000, cyclesDone: cycles })
          }
        } else {
          playChime('reminder')
          setTimer({ phase: 'work', endsAt: Date.now() + cfg.workMin * 60000 })
        }
      }
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [timer, cfg, setTimer])

  const total = (timer.phase === 'break' ? cfg.breakMin : cfg.workMin) * 60
  const progress = total > 0 ? 1 - left / total : 0
  const m = Math.floor(left / 60)
  const s = left % 60

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="flex items-center gap-2 text-[0.8em] font-semibold">
        <span className={timer.phase === 'break' ? 'text-ok' : 'text-primary'}>
          {timer.phase === 'break' ? 'BREAK' : timer.phase === 'idle' ? 'READY' : 'FOCUS'}
        </span>
        <span className="text-ink-faint">
          cycle {Math.min(timer.cyclesDone + (timer.phase === 'work' ? 1 : 0), cfg.goalCycles)}/{cfg.goalCycles}
        </span>
      </div>
      <div className="relative">
        <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--sunken)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={timer.phase === 'break' ? 'var(--ok)' : 'var(--primary)'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 52 * progress} ${2 * Math.PI * 52}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[1.5em] font-bold tabular-nums">
          {`${m}:${`${s}`.padStart(2, '0')}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={timer.running ? 'outline' : 'primary'}
          icon={timer.running ? <Pause size={13} /> : <Play size={13} />}
          onClick={() => {
            if (timer.running && timer.endsAt) {
              const remaining = timer.endsAt - Date.now()
              setTimer({ running: false, endsAt: null })
              setLeft(Math.max(0, Math.ceil(remaining / 1000)))
            } else {
              const phase = timer.phase === 'idle' ? 'work' : timer.phase
              const startLeft = timer.running ? left : (phase === 'break' ? cfg.breakMin * 60 : cfg.workMin * 60)
              setTimer({ running: true, phase, endsAt: Date.now() + startLeft * 1000 })
              setLeft(startLeft)
            }
            void active
          }}
        >
          {timer.running ? 'Pause' : 'Start'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTimer({ phase: 'idle', endsAt: null, running: false, cyclesDone: timer.cyclesDone })
            setLeft(cfg.workMin * 60)
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}

function MusicWidget() {
  const { tracks, currentId, playing, volume, skin, setPlaying, select, setVolume } = useMusicStore()
  const current = tracks.find((t) => t.id === currentId)
  const next = () => {
    if (tracks.length === 0) return
    const i = tracks.findIndex((t) => t.id === currentId)
    select(tracks[(i + 1) % tracks.length].id)
  }
  if (!current) {
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1 text-[0.82em] text-ink-faint">
        <Music2 size={20} />
        Nothing queued — add music on the Music page.
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <div className={`relative h-14 w-14 shrink-0 rounded-full ${playing && skin === 'disc' ? 'spin-slow' : ''}`} style={{ background: 'conic-gradient(var(--c1), var(--c2), var(--c5), var(--c1))' }}>
        <div className="absolute inset-2 rounded-full bg-raised" />
        <div className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9em] font-medium">{current.name}</div>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="slider mt-1 w-full"
        />
      </div>
      <div className="flex items-center gap-0.5">
        <IconBtn label={playing ? 'Pause' : 'Play'} className="h-8 w-8" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </IconBtn>
        <IconBtn label="Next track" className="h-8 w-8" onClick={next}>
          <SkipForward size={15} />
        </IconBtn>
        <span className="sr-only">{playing ? 'Playing' : 'Paused'} {volume && <Volume2 size={12} />}</span>
      </div>
    </div>
  )
}

function NotesWidget() {
  const pages = usePagesStore((s) => s.pages)
  const setBlocks = usePagesStore((s) => s.setBlocks)
  const personal = Object.values(pages)
    .filter((p) => p.branch === 'personal')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const [pageId, setPageId] = useState<string>(personal[0]?.id ?? '')
  const page = pages[pageId]

  // Same pages store record the Notes page and editor use (§7) — edits here
  // are instantly visible everywhere.
  if (!page) {
    return <div className="py-6 text-center text-[0.82em] text-ink-faint">No notes yet.</div>
  }
  const blocks = page.blocks.filter((b) => b.parentId === null).sort((a, b) => a.order - b.order)
  return (
    <div className="flex h-full flex-col">
      <select
        className="focus-ring mb-2 h-8 rounded-token-sm border border-line bg-surface/60 px-2 text-[0.8em]"
        value={pageId}
        onChange={(e) => setPageId(e.target.value)}
        aria-label="Note to edit"
      >
        {personal.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {blocks
          .filter((b) => ['paragraph', 'heading1', 'heading2', 'heading3', 'todo', 'bullet', 'quote'].includes(b.type))
          .map((b) => (
            <div
              key={b.id}
              role="textbox"
              aria-label="Note line"
              aria-multiline
              contentEditable
              suppressContentEditableWarning
              className={`block-text focus-ring w-full rounded-sm ${
                b.type === 'heading1'
                  ? 'text-[1.1em] font-bold'
                  : b.type === 'heading2'
                    ? 'text-[1em] font-semibold'
                    : b.type === 'todo' && b.checked
                      ? 'line-through opacity-60'
                      : 'text-[0.88em]'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
              onInput={(e) => {
                void setBlocks(
                  page.id,
                  page.blocks.map((x) => (x.id === b.id ? { ...x, content: e.currentTarget.textContent ?? '' } : x))
                )
              }}
            >
              {b.type === 'todo' && <span>{b.checked ? '☑ ' : '☐ '}</span>}
              {b.type === 'bullet' && <span>• </span>}
              {b.content}
            </div>
          ))}
      </div>
    </div>
  )
}

function PetWidget() {
  const mood = usePetStore((s) => s.mood)
  const bumpHappy = usePetStore((s) => s.bumpHappy)
  return (
    <div className="flex flex-col items-center gap-1 py-1" onClick={bumpHappy} role="button" aria-label={`Pet, mood ${mood}`}>
      <Pet mood={mood} size={90} />
      <span className="text-[0.75em] text-ink-muted">{mood}</span>
    </div>
  )
}

interface WeatherData {
  temp: number
  feels: number
  code: number
  hi: number
  lo: number
  wind: number
}

const WEATHER_LABEL: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  80: 'Showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail'
}

function WeatherWidget() {
  const { lat, lon, city } = useSettingsStore((s) => s.weather)
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`)
      .then((r) => {
        if (!r.ok) throw new Error('weather')
        return r.json()
      })
      .then((j) => {
        if (!alive) return
        setData({
          temp: j.current.temperature_2m,
          feels: j.current.apparent_temperature,
          code: j.current.weather_code,
          hi: j.daily.temperature_2m_max[0],
          lo: j.daily.temperature_2m_min[0],
          wind: j.current.wind_speed_10m
        })
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [lat, lon])

  if (error) return <div className="py-6 text-center text-[0.82em] text-ink-faint">Offline — weather unavailable.</div>
  if (!data) return <div className="py-6 text-center text-[0.82em] text-ink-faint">Loading…</div>
  return (
    <div className="flex items-center gap-3">
      <CloudSun size={30} className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <div className="text-[0.85em] font-medium">{city}</div>
        <div className="text-[0.78em] text-ink-muted">{WEATHER_LABEL[data.code] ?? '—'}</div>
      </div>
      <div className="text-right">
        <div className="text-[1.3em] font-semibold tabular-nums">{Math.round(data.temp)}°</div>
        <div className="text-[0.7em] text-ink-faint">
          H {Math.round(data.hi)}° · L {Math.round(data.lo)}° · {Math.round(data.wind)} km/h
        </div>
      </div>
    </div>
  )
}
