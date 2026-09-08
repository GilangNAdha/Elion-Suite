import { SpotlightCard } from '../components/motion/SpotlightCard'
import { StarBorder } from '../components/motion/StarBorder'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  Hand,
  Lock,
  Music2,
  Plus,
  Swords,
  Sun,
  FileText,
  HardDrive
} from 'lucide-react'
import { db } from '../lib/db'
import type { Alarm, CalEvent, WorkspaceItem } from '../lib/types'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { useLockdownStore } from '../stores/lockdownStore'
import { usePetStore } from '../stores/petStore'
import { useSettingsStore } from '../stores/settingsStore'
import { Button, IconBtn, StatusPill, useToasts } from '../components/ui'
import { ItemModal } from '../components/items/ItemModal'
import { MusicCard } from '../components/music/Turntable'
import { WeatherWidget } from '../components/lockdown/WeatherWidget'
import { DEFAULT_STATUSES } from '../components/views/views'
import {
  todayISO,
  toISODate,
  addDays,
  focusTotals,
  minutesLabel,
  streakFor,
  occursOn,
  timeAgo
} from '../lib/time'
import { pageIconFor } from '../components/pageIcons'

export const RAIL_START = 7
export const RAIL_END = 22
export const railPercent = (hour: number) =>
  ((Math.min(RAIL_END, Math.max(RAIL_START, hour)) - RAIL_START) / (RAIL_END - RAIL_START)) * 100

const MOOD_COPY = {
  idle: 'Keeping you company.',
  happy: 'A little win. A little victory dance.',
  focused: 'Holding the line while you focus.',
  tired: 'Even knights need a rest.',
  worried: 'One small step gets us moving.'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const items = useItemsStore((s) => s.items)
  const databases = useItemsStore((s) => s.databases)
  const pages = usePagesStore((s) => s.pages)
  const sessions = useLockdownStore((s) => s.sessions)
  const name = useSettingsStore((s) => s.profileName)
  const [editing, setEditing] = useState<WorkspaceItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'today' | 'upcoming'>('today')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  const today = toISODate(now)
  const all = Object.values(items)
  const tasks = all.filter((i) => i.type !== 'habit' && i.type !== 'epic')
  const isDone = (item: WorkspaceItem) =>
    (databases[item.databaseId ?? '']?.statuses ?? DEFAULT_STATUSES).some(
      (s) => s.id === item.status && s.isDone
    )
  const openTasks = tasks
    .filter((i) => !isDone(i))
    .sort((a, b) => {
      const score = (i: WorkspaceItem) =>
        (i.dueDate && i.dueDate <= today ? 0 : 4) + (i.status === 'doing' ? 0 : 2) + (i.databaseId ? 1 : 0)
      return (
        score(a) - score(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.rank - b.rank
      )
    })
  const displayed = tab === 'today' ? openTasks : openTasks.filter((i) => i.dueDate && i.dueDate > today)
  const featured = displayed[0]
  const habits = all.filter((i) => i.type === 'habit')
  const dueHabits = habits.filter((h) => occursOn(h.recurrence, now))
  const doneHabits = dueHabits.filter((h) => h.completions?.includes(today)).length
  const totals = focusTotals(sessions)
  const weekFocus = Array.from(
    { length: 7 },
    (_, i) => totals.byDay.get(toISODate(addDays(now, -i))) ?? 0
  ).reduce((sum, n) => sum + n, 0)
  const completed = tasks.filter(isDone).length
  const overdue = openTasks.filter((i) => i.dueDate && i.dueDate < today).length
  const greeting =
    now.getHours() < 5
      ? 'A quiet night'
      : now.getHours() < 12
        ? 'Good morning'
        : now.getHours() < 18
          ? 'Good afternoon'
          : 'Good evening'

  const complete = async (item: WorkspaceItem) => {
    const statuses = databases[item.databaseId ?? '']?.statuses ?? DEFAULT_STATUSES
    const target = statuses.find((s) => s.isDone)
    if (!target) {
      setEditing(item)
      return
    }
    await useItemsStore.getState().setItemStatus(item.id, target.id)
    usePetStore.getState().bumpHappy()
    useToasts.getState().push(`Completed “${item.title}”`, 'success')
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <div className="date-label">
            <Sun size={14} />
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1>
            {greeting}
            {name && name !== 'You' ? `, ${name}` : ''}
            <span>.</span>
          </h1>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
          Add task
        </Button>
      </header>

      <div className="dashboard-layout">
        <div className="dashboard-main">
          <SpotlightCard as="section" className="panel today-panel" aria-labelledby="today-title">
            <div className="panel-heading">
              <div className="panel-title">
                <Sun size={17} />
                <h2 id="today-title">Today</h2>
                <span className="count-badge">{openTasks.length}</span>
              </div>
              <div className="quiet-tabs" role="tablist" aria-label="Task horizon">
                <button role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>
                  Up next
                </button>
                <button role="tab" aria-selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
                  Upcoming
                </button>
              </div>
            </div>
            {featured ? (
              <div className="featured-task">
                <div className="featured-task-meta">
                  <span className="small-dot" />
                  {featured.databaseId
                    ? (databases[featured.databaseId]?.name ?? 'Workspace')
                    : 'Personal task'}
                  <span className="featured-due">
                    <Clock3 size={12} />
                    {featured.dueDate === today
                      ? 'Due today'
                      : featured.dueDate && featured.dueDate < today
                        ? 'Overdue'
                        : featured.dueDate
                          ? new Date(`${featured.dueDate}T12:00:00`).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric'
                            })
                          : 'No deadline'}
                  </span>
                </div>
                <button className="featured-task-title" onClick={() => setEditing(featured)}>
                  <h3>{featured.title}</h3>
                </button>
                <p>
                  {featured.description ||
                    'Give this your full attention. Everything else can wait a little.'}
                </p>
                <div className="featured-actions">
                  <Button
                    className="focus-action"
                    icon={<Lock size={14} />}
                    onClick={() => navigate('/lockdown', { state: { objective: featured.title } })}
                  >
                    Start focus session
                  </Button>
                  <button className="text-action" onClick={() => void complete(featured)}>
                    <Check size={14} />
                    Complete task
                  </button>
                </div>
              </div>
            ) : (
              <div className="featured-task empty-feature">
                <h3>{tab === 'upcoming' ? 'Nothing on the horizon.' : 'A little breathing room.'}</h3>
                <p>
                  {tab === 'upcoming'
                    ? 'Add a due date to a task to plan ahead.'
                    : 'Add a task when you’re ready for your next step.'}
                </p>
                <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Add task
                </Button>
              </div>
            )}
            <div className="next-task-list">
              {displayed.slice(1, 3).map((item) => (
                <div className="next-task-row" key={item.id}>
                  <button
                    className="task-check"
                    aria-label={`Complete ${item.title}`}
                    onClick={() => void complete(item)}
                  >
                    <Check size={12} />
                  </button>
                  <button className="next-task-name" onClick={() => setEditing(item)}>
                    {item.title}
                  </button>
                  <span>{item.databaseId ? 'Project' : 'Personal'}</span>
                </div>
              ))}
            </div>
            <div className="today-metrics">
              <div>
                <span className="metric">
                  {String(completed).padStart(2, '0')}
                  <small>/{String(tasks.length).padStart(2, '0')}</small>
                </span>
                <span>Tasks completed</span>
              </div>
              <div>
                <span className="metric">{minutesLabel(weekFocus)}</span>
                <span>Focus this week</span>
              </div>
              <div>
                <span className="metric effort">
                  {totals.currentStreak}
                  <small> {totals.currentStreak === 1 ? 'day' : 'days'}</small>
                </span>
                <span>Focus streak</span>
              </div>
            </div>
          </SpotlightCard>

          <div className="dashboard-secondary">
            <CalendarCard items={tasks} onOpenItem={setEditing} />
            <section className="panel dashboard-music" aria-labelledby="music-heading">
              <div className="panel-heading">
                <div className="panel-title">
                  <Music2 size={16} />
                  <h2 id="music-heading">On the record</h2>
                </div>
                <button className="text-link" onClick={() => navigate('/music')}>
                  Library
                </button>
              </div>
              <MusicCard compact />
            </section>
          </div>

          <section className="recent-section" aria-labelledby="recent-heading">
            <div className="panel-heading">
              <h2 id="recent-heading">Pick up where you left off</h2>
              <button className="text-link" onClick={() => navigate('/workspace')}>
                Workspace
              </button>
            </div>
            <div className="recent-pages">
              {Object.values(pages)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 3)
                .map((page) => {
                  const Icon = pageIconFor(page.icon)
                  return (
                    <button
                      key={page.id}
                      className="recent-page"
                      onClick={() =>
                        navigate(page.branch === 'personal' ? `/notes/${page.id}` : `/workspace/${page.id}`)
                      }
                    >
                      <span className="page-glyph">
                        <Icon size={17} strokeWidth={1.5} />
                      </span>
                      <span>
                        <strong>{page.title}</strong>
                        <small>{timeAgo(page.updatedAt)}</small>
                      </span>
                    </button>
                  )
                })}
            </div>
            {Object.keys(pages).length === 0 && (
              <button className="text-action" onClick={() => navigate('/workspace')}>
                Create your first page
              </button>
            )}
          </section>
        </div>

        <aside className="dashboard-aside" aria-label="Your rhythm">
          <section className="panel habits-panel" aria-labelledby="habit-heading">
            <div className="panel-heading">
              <div className="panel-title">
                <Flame size={17} className="effort" />
                <h2 id="habit-heading">Small steps, daily</h2>
              </div>
              <button className="text-link" onClick={() => navigate('/habits')}>
                View all
              </button>
            </div>
            <div className="habit-summary">
              <span className="metric effort">
                {doneHabits}
                <small>/{dueHabits.length}</small>
              </span>
              <span>habits today</span>
              <div className="habit-progress">
                <span style={{ width: `${dueHabits.length ? (doneHabits / dueHabits.length) * 100 : 0}%` }} />
              </div>
            </div>
            {habits.slice(0, 3).map((habit) => (
              <HabitRow key={habit.id} habit={habit} today={today} />
            ))}
            {habits.length === 0 && (
              <div className="habit-empty">
                <p>Add your first habit to start a streak.</p>
                <Button size="sm" onClick={() => navigate('/habits')}>
                  Add habit
                </Button>
              </div>
            )}
            <p className="habit-footnote">Consistency, not perfection.</p>
          </section>

          <section className="panel weather-panel">
            <WeatherWidget />
          </section>
        </aside>
      </div>
      <footer className="dashboard-footer">
        <HardDrive size={12} />
        <span>Local-first. Your work stays yours.</span>
        {overdue > 0 && (
          <button className="text-link" onClick={() => navigate('/tasks')}>
            {overdue} overdue {overdue === 1 ? 'task' : 'tasks'} to revisit
          </button>
        )}
      </footer>
      {(editing || creating) && (
        <ItemModal
          db={editing?.databaseId ? (databases[editing.databaseId] ?? null) : null}
          databaseId={editing?.databaseId ?? null}
          editing={editing}
          creating={creating ? { type: 'task', status: 'todo', dueDate: today } : null}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function HabitRow({ habit, today }: { habit: WorkspaceItem; today: string }) {
  const done = !!habit.completions?.includes(today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6))
  return (
    <div className="dashboard-habit">
      <div className="habit-topline">
        <button
          className={`habit-check ${done ? 'is-done' : ''}`}
          aria-label={`Mark ${habit.title} ${done ? 'not done' : 'done'}`}
          aria-pressed={done}
          onClick={() => {
            void useItemsStore.getState().toggleHabitCompletion(habit.id, today)
            if (!done) usePetStore.getState().bumpHappy()
          }}
        >
          {done && <Check size={12} />}
        </button>
        <span>{habit.title}</span>
        <span className="habit-streak">
          <Flame size={11} />
          <b>{streakFor(habit.completions, habit.recurrence)}</b>
        </span>
      </div>
      <div className="habit-week">
        {days.map((day) => (
          <span
            key={toISODate(day)}
            className={
              habit.completions?.includes(toISODate(day))
                ? 'is-complete'
                : toISODate(day) === today
                  ? 'is-today'
                  : ''
            }
            title={`${day.toLocaleDateString()}: ${habit.completions?.includes(toISODate(day)) ? 'completed' : 'not completed'}`}
          >
            {habit.completions?.includes(toISODate(day)) ? (
              <Check size={10} />
            ) : (
              day.toLocaleDateString([], { weekday: 'narrow' })
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

function CalendarCard({
  items,
  onOpenItem
}: {
  items: WorkspaceItem[]
  onOpenItem: (i: WorkspaceItem) => void
}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(() => new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [ev, al] = await Promise.all([db.events.toArray(), db.alarms.toArray()])
      if (alive) {
        setEvents(ev)
        setAlarms(al)
        setNow(new Date())
      }
    }
    void load()
    const id = setInterval(() => void load(), 60000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  const selectedISO = toISODate(selected)
  const start = addDays(selected, -((selected.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const chosenEvents = events
    .filter((ev) => toISODate(new Date(ev.at)) === selectedISO)
    .map((ev) => ({
      id: ev.id,
      at: new Date(ev.at),
      title: ev.title,
      kind: 'Event',
      open: () => navigate('/calendar')
    }))
  const chosenAlarms = alarms
    .filter((a) => a.enabled && (a.repeat === 'daily' || toISODate(new Date(a.at)) === selectedISO))
    .map((a) => ({
      id: a.id,
      at: new Date(a.at),
      title: a.title,
      kind: 'Alarm',
      open: () => navigate('/alarms')
    }))
  const schedule = [...chosenEvents, ...chosenAlarms].sort(
    (a, b) => a.at.getHours() - b.at.getHours() || a.at.getMinutes() - b.at.getMinutes()
  )
  const due = items.filter((i) => i.dueDate === selectedISO)
  const current = selectedISO === todayISO()
  return (
    <section className="panel calendar-card" aria-labelledby="calendar-heading">
      <div className="panel-heading">
        <div className="panel-title">
          <CalendarDays size={16} />
          <h2 id="calendar-heading">A look at your week</h2>
        </div>
        <button className="text-link" onClick={() => navigate('/calendar')}>
          Calendar
        </button>
      </div>
      <div className="calendar-month">
        <span>{selected.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <div>
          <IconBtn label="Previous week" onClick={() => setSelected(addDays(selected, -7))}>
            <ChevronLeft size={14} />
          </IconBtn>
          <IconBtn label="Next week" onClick={() => setSelected(addDays(selected, 7))}>
            <ChevronRight size={14} />
          </IconBtn>
        </div>
      </div>
      <div className="calendar-week">
        {days.map((day) => (
          <button
            key={toISODate(day)}
            className={toISODate(day) === selectedISO ? 'is-selected' : ''}
            onClick={() => setSelected(day)}
            aria-label={day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            aria-pressed={toISODate(day) === selectedISO}
          >
            <span>{day.toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}</span>
            <strong>{day.getDate()}</strong>
            <i className={toISODate(day) === todayISO() ? 'today-mark' : ''} />
          </button>
        ))}
      </div>
      <div className="calendar-agenda">
        <div className="agenda-label">
          {current ? 'Today’s schedule' : selected.toLocaleDateString([], { weekday: 'long' })}
          <span>{schedule.length} events</span>
        </div>
        {schedule.slice(0, 2).map((event) => (
          <button className="agenda-event" key={event.id} onClick={event.open}>
            <time>{event.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            <span>{event.title}</span>
          </button>
        ))}
        {!schedule.length && <p className="calendar-empty">No events scheduled. Room to focus.</p>}
        {due.slice(0, 1).map((item) => (
          <button className="agenda-due" key={item.id} onClick={() => onOpenItem(item)}>
            <Circle size={11} />
            <span>{item.title}</span>
            <small>Due {current ? 'today' : 'this day'}</small>
          </button>
        ))}
      </div>
      <div className="today-rail" aria-label="Today timeline, 07:00 to 22:00">
        <div className="rail-rule" />
        {[7, 10, 13, 16, 19, 22].map((h) => (
          <span className="rail-tick" style={{ left: `${railPercent(h)}%` }} key={h}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
        {schedule.map((event) => (
          <button
            key={event.id}
            className="rail-event"
            style={{ left: `${railPercent(event.at.getHours() + event.at.getMinutes() / 60)}%` }}
            title={event.title}
            aria-label={`${event.title}, ${event.kind}`}
            onClick={event.open}
          />
        ))}
        {current && now.getHours() >= RAIL_START && now.getHours() <= RAIL_END && (
          <span
            className="rail-now"
            aria-label="Current time"
            style={{ left: `${railPercent(now.getHours() + now.getMinutes() / 60)}%` }}
          />
        )}
      </div>
    </section>
  )
}
