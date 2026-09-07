import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Plus, CheckSquare, Flame, CalendarDays, Lock, ArrowRight } from 'lucide-react'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { useLockdownStore } from '../stores/lockdownStore'
import { usePetStore } from '../stores/petStore'
import { Pet } from '../components/pet/Pet'
import { StatusPill, Button, EmptyState } from '../components/ui'
import { statusColor } from '../components/views/views'
import { todayISO, toISODate, addDays, focusTotals, minutesLabel, streakFor } from '../lib/time'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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
