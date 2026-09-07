import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Plus, CheckSquare, Flame, CalendarDays, Lock, ArrowRight, AlarmClock } from 'lucide-react'
import { db } from '../lib/db'
import type { Alarm, CalEvent, WorkspaceItem } from '../lib/types'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { useLockdownStore } from '../stores/lockdownStore'
import { usePetStore } from '../stores/petStore'
import { Pet } from '../components/pet/Pet'
import { StatusPill, Button, EmptyState } from '../components/ui'
import { statusColor } from '../components/views/views'
import { todayISO, toISODate, addDays, focusTotals, minutesLabel, streakFor } from '../lib/time'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export // ---------------------------------------------------------------------------
// §16.1 Today Timeline Rail — day strip 07:00–22:00 with time-positioned
// chips (due dates, alarms, events) and a live "now" marker.
// ---------------------------------------------------------------------------
const RAIL_START = 7
const RAIL_END = 22

interface RailChip {
  id: string
  hour: number
  label: string
  tone: string
  onClick: () => void
}

function TodayRail({ items, onOpenItem }: { items: WorkspaceItem[]; onOpenItem: (i: WorkspaceItem) => void }) {
  const navigate = useNavigate()
  const [events, setEvents] = useState<CalEvent[]>([])
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [now, setNow] = useState(() => new Date())
  const [openHour, setOpenHour] = useState<number | null>(null)

  useEffect(() => {
    const load = () => {
      void db.events.toArray().then(setEvents)
      void db.alarms.toArray().then(setAlarms)
      setNow(new Date())
    }
    load()
    const t = window.setInterval(load, 60000)
    return () => window.clearInterval(t)
  }, [])

  const span = RAIL_END - RAIL_START
  const today = todayISO()
  const pct = (h: number) => `${(Math.min(RAIL_END, Math.max(RAIL_START, h)) - RAIL_START) / span / 10}%`

  const chips: RailChip[] = []
  for (const i of items) {
    if (i.dueDate === today) {
      chips.push({ id: i.id, hour: 9, label: i.title, tone: 'var(--primary)', onClick: () => onOpenItem(i) })
    }
  }
  for (const a of alarms) {
    if (!a.enabled) continue
    const d = new Date(a.at)
    if (d.toISOString().slice(0, 10) === today || a.repeat === 'daily') {
      chips.push({ id: a.id, hour: d.getHours(), label: a.title, tone: 'var(--warn)', onClick: () => navigate('/alarms') })
    }
  }
  for (const ev of events) {
    const d = new Date(ev.at)
    if (d.toISOString().slice(0, 10) === today) {
      chips.push({ id: ev.id, hour: d.getHours() + d.getMinutes() / 60, label: ev.title, tone: 'var(--info)', onClick: () => navigate('/calendar') })
    }
  }
  // stack per hour slot (max 3 visible, +n popover for the rest)
  const groups = new Map<number, RailChip[]>()
  for (const c of chips) {
    const h = Math.min(RAIL_END - 0.01, Math.max(RAIL_START, Math.floor(c.hour)))
    groups.set(h, [...(groups.get(h) ?? []), c])
  }

  const nowH = now.getHours() + now.getMinutes() / 60
  const nowVisible = nowH >= RAIL_START && nowH <= RAIL_END

  return (
    <section
      className="elev-raised relative mb-4 rounded-token-lg border border-line bg-raised p-4 pt-6"
      aria-label="Today timeline"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[0.95em] font-semibold">
          <CalendarDays size={15} className="text-primary" />
          Today
        </h2>
        <span className="font-mono text-[0.72em] text-ink-faint">
          {RAIL_START}:00 – {RAIL_END}:00
        </span>
      </div>
      <div className="relative h-14">
        {Array.from({ length: span + 1 }, (_, i) => RAIL_START + i).map((h) => (
          <div key={h} className="absolute inset-y-0" style={{ left: pct(h) }} aria-hidden>
            <div className="h-full w-px bg-line" />
            <span className="absolute -top-3.5 left-0 -translate-x-1/2 font-mono text-[0.62em] text-ink-faint">
              {h}
            </span>
          </div>
        ))}
        {[...groups.entries()].map(([h, list]) => (
          <div key={h} className="absolute inset-y-0" style={{ left: pct(h) }} aria-hidden={false}>
            {list.slice(0, 3).map((c, idx) => (
              <button
                key={c.id}
                className="focus-ring absolute left-1 max-w-28 truncate rounded-token-sm px-1.5 py-0.5 text-[0.7em] font-medium"
                style={{
                  top: 4 + idx * 17,
                  background: c.tone,
                  color: 'var(--bg)'
                }}
                title={c.label}
                onClick={c.onClick}
                aria-label={`${c.label} at ${h}:00`}
              >
                {c.label}
              </button>
            ))}
            {list.length > 3 && (
              <>
                <button
                  className="focus-ring absolute left-1 rounded-token-sm bg-surface px-1.5 py-0.5 text-[0.7em] text-ink-muted hover:text-ink"
                  style={{ top: 4 + 3 * 17 }}
                  onClick={() => setOpenHour(openHour === h ? null : h)}
                  aria-label={`${list.length - 3} more at ${h}:00`}
                >
                  +{list.length - 3}
                </button>
                {openHour === h && (
                  <div className="elev-overlay absolute left-1 z-20 mt-1 w-44 rounded-token border border-line bg-raised p-1" style={{ top: 4 + 3 * 17 }}>
                    {list.slice(3).map((c) => (
                      <button
                        key={c.id}
                        className="focus-ring block w-full truncate rounded-token-sm px-2 py-1 text-left text-[0.75em] hover:bg-surface"
                        onClick={() => {
                          setOpenHour(null)
                          c.onClick()
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {nowVisible && (
          <div className="absolute inset-y-0 z-10 w-px bg-bad" style={{ left: pct(nowH) }} aria-hidden>
            <span
              className="absolute -top-3.5 left-0 -translate-x-1/2 rounded-token-sm px-1 py-0.5 font-mono text-[0.6em] font-semibold"
              style={{ background: 'var(--bad)', color: 'var(--bg)' }}
            >
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        {chips.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[0.8em] text-ink-faint">
            Nothing scheduled today — add a due date, alarm, or event.
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[0.68em] text-ink-faint">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--primary)' }} /> due date
        </span>
        <span className="flex items-center gap-1">
          <AlarmClock size={11} /> alarm
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--info)' }} /> event
        </span>
      </div>
    </section>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const items = useItemsStore((s) => s.items)
  const databases = useItemsStore((s) => s.databases)
  const pages = usePagesStore((s) => s.pages)
  const sessions = useLockdownStore((s) => s.sessions)
  const petMood = usePetStore((s) => s.mood)

  const today = todayISO()
  const all = Object.values(items)
  const dueToday = all.filter((i) => i.dueDate === today)
  const overdue = all.filter(
    (i) =>
      i.dueDate &&
      i.dueDate < today &&
      !(databases[i.databaseId ?? '']?.statuses.find((st) => st.id === i.status)?.isDone)
  )
  const habits = all.filter((i) => i.type === 'habit')
  const habitsDue = habits.filter((h) => (h.completions ?? []).length || h.recurrence)
  const doneHabits = habits.filter((h) => (h.completions ?? []).includes(today))

  const totals = focusTotals(sessions)
  const chart = Array.from({ length: 7 }, (_, idx) => {
    const d = addDays(new Date(), idx - 6)
    return {
      day: d.toLocaleDateString([], { weekday: 'short' }),
      min: Math.round((totals.byDay.get(toISODate(d)) ?? 0) / 60000)
    }
  })

  const dueList = [...overdue, ...dueToday].filter((i): i is (typeof i) & { dueDate: string } => !!i.dueDate)

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.9em] font-bold tracking-tight">
            {greeting}
            <span className="text-ink-faint">.</span>
          </h1>
          <p className="text-[0.95em] text-ink-muted">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            {overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Lock size={14} />} onClick={() => navigate('/lockdown')}>
            Lockdown
          </Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate('/tasks')}>
            New task
          </Button>
        </div>
      </div>

      <TodayRail
        items={all}
        onOpenItem={(i) => navigate(i.databaseId ? `/workspace/items/${i.databaseId}` : '/tasks')}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* today */}
        <section className="elev-raised rounded-token-lg border border-line bg-raised p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[0.95em] font-semibold">
              <CheckSquare size={15} className="text-primary" />
              Due today
              <span className="text-[0.75em] font-normal text-ink-faint">({dueToday.length + overdue.length})</span>
            </h2>
            <button className="focus-ring text-[0.78em] text-primary hover:underline" onClick={() => navigate('/tasks')}>
              View all
            </button>
          </div>
          <ul className="space-y-1.5">
            {dueList.slice(0, 6).map((i) => (
              <li key={i.id}>
                <button
                  className="focus-ring flex w-full items-center gap-2 rounded-token-sm px-2 py-1.5 text-left hover:bg-surface"
                  onClick={() => navigate(i.databaseId ? `/workspace/items/${i.databaseId}` : '/tasks')}
                >
                  <span className="min-w-0 flex-1 truncate text-[0.88em]">{i.title}</span>
                  <span className={`text-[0.7em] ${i.dueDate < today ? 'text-bad' : 'text-ink-faint'}`}>
                    {i.dueDate < today ? 'overdue' : 'today'}
                  </span>
                  <StatusPill
                    small
                    color={statusColor(databases[i.databaseId ?? ''] ?? null, i.status)}
                    label={databases[i.databaseId ?? '']?.statuses.find((s) => s.id === i.status)?.name ?? i.status}
                  />
                </button>
              </li>
            ))}
            {dueToday.length + overdue.length === 0 && (
              <li className="py-4 text-center text-[0.82em] text-ink-faint">Nothing due today. Enjoy the calm.</li>
            )}
          </ul>
        </section>

        {/* habits */}
        <section className="elev-raised rounded-token-lg border border-line bg-raised p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[0.95em] font-semibold">
              <Flame size={15} className="text-warn" />
              Habits
              <span className="text-[0.75em] font-normal text-ink-faint">
                {doneHabits.length}/{habitsDue.length} today
              </span>
            </h2>
            <button className="focus-ring text-[0.78em] text-primary hover:underline" onClick={() => navigate('/habits')}>
              All habits
            </button>
          </div>
          <ul className="space-y-1.5">
            {habits.slice(0, 5).map((h) => {
              const done = (h.completions ?? []).includes(today)
              return (
                <li key={h.id} className="flex items-center gap-2">
                  <button
                    className="focus-ring flex h-5 w-5 items-center justify-center rounded-full border transition-colors"
                    style={{
                      borderColor: done ? 'var(--ok)' : 'var(--line-strong)',
                      background: done ? 'var(--ok)' : 'transparent'
                    }}
                    aria-label={`Mark ${h.title} ${done ? 'not done' : 'done'}`}
                    onClick={() => {
                      void useItemsStore.getState().toggleHabitCompletion(h.id, today)
                      if (!done) usePetStore.getState().bumpHappy()
                    }}
                  >
                    {done && <span className="text-[0.7em] font-bold text-white">✓</span>}
                  </button>
                  <span className={`min-w-0 flex-1 truncate text-[0.88em] ${done ? 'line-through opacity-60' : ''}`}>
                    {h.title}
                  </span>
                  <span className="text-[0.7em] text-ink-faint">
                    {streakFor(h.completions, h.recurrence)} streak
                  </span>
                </li>
              )
            })}
            {habits.length === 0 && (
              <li className="py-4 text-center text-[0.82em] text-ink-faint">No habits yet — add one in Habits.</li>
            )}
          </ul>
        </section>

        {/* pet + focus */}
        <section className="elev-raised flex flex-col items-center justify-between rounded-token-lg border border-line bg-raised p-4">
          <div className="flex w-full items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[0.95em] font-semibold">
              <Lock size={15} className="text-primary" />
              Focus
            </h2>
            <button className="focus-ring text-[0.78em] text-primary hover:underline" onClick={() => navigate('/profile')}>
              Stats
            </button>
          </div>
          <div className="flex w-full flex-1 items-center justify-around py-3">
            <Pet mood={petMood} size={104} />
            <div className="space-y-1 text-[0.85em]">
              <div>
                <div className="text-[1.5em] font-bold tabular-nums" style={{ fontSize: '1.9em' }}>
                  {minutesLabel(totals.totalMs)}
                </div>
                <div className="text-[0.72em] text-ink-faint">total focus time</div>
              </div>
              <div className="text-[0.8em] text-ink-muted">
                {totals.currentStreak}d streak · {totals.sessionCount} sessions
              </div>
            </div>
          </div>
          <div className="h-20 w-full rounded-token bg-surface/40 p-1">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--ink-faint)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'var(--ink-faint)', fontSize: 9 }} width={22} />
                <Tooltip
                  contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`${v} min`, 'focus']}
                />
                <Bar dataKey="min" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* recent pages */}
      <section className="mt-4">
        <div className="mb-3 flex items-center gap-1.5 text-[0.95em] font-semibold">
          <LayoutGrid size={15} className="text-primary" />
          Recent pages
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(pages)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 4)
            .map((p) => (
              <button
                key={p.id}
                className="focus-ring elev-raised group rounded-token border border-line bg-raised p-3.5 text-left transition-transform hover:-translate-y-0.5"
                onClick={() => navigate(p.branch === 'personal' ? `/notes/${p.id}` : `/workspace/${p.id}`)}
              >
                <div className="truncate text-[0.92em] font-medium group-hover:text-primary">{p.title}</div>
                <div className="mt-1 text-[0.72em] text-ink-faint">
                  {p.branch === 'personal' ? 'Note' : 'Workspace'} · {p.blocks.length} blocks
                </div>
              </button>
            ))}
        </div>
      </section>

      <div className="mt-6 flex items-center gap-2 text-[0.78em] text-ink-faint">
        <CalendarDays size={13} />
        <span>
          {new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })} — local-first, everything on this
          device.
        </span>
        <ArrowRight size={12} />
        <button className="focus-ring text-primary hover:underline" onClick={() => navigate('/settings')}>
          Settings
        </button>
      </div>
    </div>
  )
}
