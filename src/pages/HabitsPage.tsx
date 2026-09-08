import { useMemo, useState } from 'react'
import { Flame, Plus, Pencil, Trash2, Repeat } from 'lucide-react'
import type { WorkspaceItem } from '../lib/types'
import { useItemsStore } from '../stores/itemsStore'
import { usePetStore } from '../stores/petStore'
import { ItemModal } from '../components/items/ItemModal'
import { Button, EmptyState, IconBtn } from '../components/ui'
import { doneOn, occursOn, recurrenceLabelFull, streakFor, todayISO, addDays, toISODate } from '../lib/time'

/**
 * Habit Tracker — a specialized view over `WorkspaceItem` records with
 * `type: 'habit'` + recurrence (§7). Streaks are computed from the same
 * completions the Calendar renders, so numbers always agree.
 */
export function HabitsPage() {
  const items = useItemsStore((s) => s.items)
  const deleteItem = useItemsStore((s) => s.deleteItem)
  const bumpHappy = usePetStore((s) => s.bumpHappy)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<WorkspaceItem | null>(null)
  const [creating, setCreating] = useState<Partial<WorkspaceItem> | null>(null)

  const habits = useMemo(
    () => Object.values(items).filter((i) => i.type === 'habit').sort((a, b) => a.title.localeCompare(b.title)),
    [items]
  )
  const today = todayISO()
  const sel = habits.find((h) => h.id === selected)

  return (
    <div className="mx-auto max-w-5xl p-6 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-[1.7em] font-bold tracking-tight">Habits</h1>
          <p className="text-[0.88em] text-ink-muted">
            Recurring items with streaks — the same records power the Calendar and Dashboard.
          </p>
        </div>
        <span className="flex-1" />
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setCreating({ type: 'habit', status: 'todo' })}
        >
          New habit
        </Button>
      </div>

      {habits.length === 0 ? (
        <EmptyState
          icon={<Repeat size={20} />}
          title="No habits yet"
          hint="Create a recurring item (type: habit) and track it here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {habits.map((h) => {
            const streak = streakFor(h.completions, h.recurrence)
            const doneToday = doneOn(h.completions, today)
            const week = Array.from({ length: 7 }, (_, i) => {
              const d = addDays(new Date(), i - 6)
              const iso = toISODate(d)
              return { iso, due: occursOn(h.recurrence, d), done: doneOn(h.completions, iso), isToday: iso === today }
            })
            return (
              // Card is a <div>, NOT a <button>: it contains real <button>
              // children (title-select, done-toggle, edit, delete). A <button>
              // cannot nest other interactive elements (invalid HTML + React
              // validateDOMNesting warnings). Body click still selects.
              <div
                key={h.id}
                onClick={() => setSelected(h.id)}
                className={`elev-raised group cursor-pointer rounded-token-lg border p-4 transition-colors ${
                  selected === h.id ? 'border-primary bg-primary/5' : 'border-line bg-raised hover:border-line-strong'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={selected === h.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(h.id)
                    }}
                    className={`focus-ring min-w-0 flex-1 truncate rounded-token-sm text-left text-[1em] font-semibold ${
                      selected === h.id ? 'text-primary' : 'text-ink'
                    }`}
                    title={selected === h.id ? 'Hide details' : 'Show 12-week details'}
                  >
                    {h.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${h.title} ${doneToday ? 'not done' : 'done'} today`}
                    aria-pressed={doneToday}
                    className={`focus-ring flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                      doneToday ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent hover:border-ok'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void useItemsStore.getState().toggleHabitCompletion(h.id, today)
                      if (!doneToday) bumpHappy()
                    }}
                  >
                    ✓
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[0.78em] text-ink-muted">
                  <Repeat size={12} />
                  {recurrenceLabelFull(h.recurrence)}
                  <span className="ml-auto flex items-center gap-1 font-semibold text-warn">
                    <Flame size={13} />
                    {streak} day{streak === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {week.map((d) => (
                    <span
                      key={d.iso}
                      title={`${d.iso}${d.due ? (d.done ? ' · done' : ' · due') : ' · off'}`}
                      className={`h-6 flex-1 rounded-sm border transition-colors ${
                        !d.due
                          ? 'border-transparent bg-sunken/60'
                          : d.done
                            ? 'border-ok/50 bg-ok/60'
                            : d.isToday
                              ? 'border-primary bg-primary/20'
                              : 'border-line bg-surface'
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn
                    label={`Edit ${h.title}`}
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(h)
                    }}
                  >
                    <Pencil size={12} />
                  </IconBtn>
                  <IconBtn
                    label={`Delete ${h.title}`}
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(`Delete habit “${h.title}”?`)) void deleteItem(h.id)
                    }}
                  >
                    <Trash2 size={12} />
                  </IconBtn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {sel && (
        <div className="elev-raised mt-4 rounded-token-lg border border-line bg-raised p-4">
          <div className="mb-2 text-[0.9em] font-semibold">Last 12 weeks — {sel.title}</div>
          <Heatmap habit={sel} />
        </div>
      )}

      {(editing || creating) && (
        <ItemModal db={null} databaseId={null} editing={editing} creating={creating} onClose={() => { setEditing(null); setCreating(null) }} />
      )}
    </div>
  )
}

function Heatmap({ habit }: { habit: WorkspaceItem }) {
  const weeks = 12
  const cells: { iso: string; due: boolean; done: boolean }[] = []
  const today = new Date()
  const start = addDays(today, -(weeks * 7 - 1) - today.getDay())
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i)
    const iso = toISODate(d)
    cells.push({ iso, due: occursOn(habit.recurrence, d), done: doneOn(habit.completions, iso) })
  }
  return (
    <div className="flex gap-1" aria-label="12 week heatmap">
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-col gap-1">
          {cells.slice(w * 7, w * 7 + 7).map((c) => (
            <span
              key={c.iso}
              title={`${c.iso}${c.due ? (c.done ? ' · done' : ' · missed') : ' · off'}`}
              className={`h-3 w-3 rounded-sm ${
                !c.due ? 'bg-sunken' : c.done ? 'bg-ok' : 'bg-bad/50'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
