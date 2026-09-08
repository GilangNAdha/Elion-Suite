import { useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  Clock3,
  Timer,
  Music2,
  NotebookPen,
  Sparkles,
  CloudSun,
  GripVertical,
  X,
  Play,
  Pause,
  SkipForward,
  Plus,
  Volume2
} from 'lucide-react'
import type { FocusSession, LockdownPreset, WidgetInstance } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { useMusicStore } from '../../stores/musicStore'
import { usePagesStore } from '../../stores/pagesStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { playChime } from '../../lib/audio'
import { IconBtn, Button } from '../ui'
import { DictationButton } from '../Dictation'
import { lastVoiceElement } from '../../lib/voice/textTarget'
import { MusicCard } from '../music/Turntable'
import { FocusTimer } from './FocusTimer'
import { WeatherWidget } from './WeatherWidget'

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
    <div className="widget-layer absolute inset-0 z-10">
      {/* Legacy pet-widget records are preserved, but the pet is now the global overlay. */}
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
            <div className="mb-1.5 px-1 text-[0.72em] font-semibold  text-ink-faint">Add widget</div>
            <div className="flex flex-col gap-1">
              {WIDGET_DEFS.map((d) => (
                <button
                  key={d.type}
                  className={`focus-ring flex items-center gap-2 rounded-token-sm px-2 py-1.5 text-[0.85em] ${
                    adding?.type === d.type
                      ? 'bg-primary text-primary-on'
                      : 'text-ink-muted hover:bg-surface hover:text-ink'
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
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `widget:${w.id}`,
    data: { widget: w }
  })
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  return (
    <div
      ref={setNodeRef}
      className={`focus-widget glass-panel absolute rounded-token border border-line ${isDragging ? 'z-40 shadow-xl' : 'z-10'}`}
      style={{
        left: w.x,
        top: w.y,
        width: w.w,
        minHeight: w.h,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined
      }}
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        <button
          {...listeners}
          {...attributes}
          aria-label={`Move ${def.label} widget`}
          className="cursor-grab text-ink-faint active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </button>
        <def.icon size={13} className="text-primary" />
        <span className="flex-1 truncate text-[0.78em] font-semibold text-ink-muted">{def.label}</span>
        {customize && (
          <button
            className="focus-ring rounded p-0.5 text-ink-faint hover:text-bad"
            aria-label={`Remove ${def.label} widget`}
            onClick={onClose}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="p-2" style={{ minHeight: w.h - 34 }}>
        {w.type === 'clock' && <ClockWidget />}
        {w.type === 'timer' && <TimerWidget preset={preset} />}
        {w.type === 'music' && <MusicWidget />}
        {w.type === 'notes' && <NotesWidget />}
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
              onResize(Math.max(180, r.w + ev.clientX - r.x), Math.max(120, r.h + ev.clientY - r.y))
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
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="26"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${(now.getHours() % 12) * 30 + now.getMinutes() / 2} 50 50)`}
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="16"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${angle} 50 50)`}
        />
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
  return <FocusTimer preset={preset} compact />
}

function MusicWidget() {
  return <MusicCard compact />
}

function NotesWidget() {
  const noteRef = useRef<HTMLDivElement>(null)
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
    <div ref={noteRef} className="notes-widget flex h-full flex-col">
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
      <DictationButton
        label="Dictate note"
        getTarget={() => {
          const last = lastVoiceElement()
          return last && noteRef.current?.contains(last)
            ? last
            : (noteRef.current?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null)
        }}
      />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {blocks
          .filter((b) =>
            ['paragraph', 'heading1', 'heading2', 'heading3', 'todo', 'bullet', 'quote'].includes(b.type)
          )
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
                  page.blocks.map((x) =>
                    x.id === b.id ? { ...x, content: e.currentTarget.textContent ?? '' } : x
                  )
                )
              }}
            >
              {b.content}
            </div>
          ))}
      </div>
    </div>
  )
}
