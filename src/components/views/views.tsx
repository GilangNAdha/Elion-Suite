import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, CalendarDays, ChevronLeft, ChevronRight, Flag, Tag, Clock3, ImagePlus
} from 'lucide-react'
import type { CalEvent, WorkspaceDatabase, WorkspaceItem } from '../../lib/types'
import { fieldsFor, OPS_BY_KIND, type FieldDef } from '../../lib/filterEngine'
import { StatusPill, IconBtn, EmptyState } from '../ui'
import { useItemsStore } from '../../stores/itemsStore'
import { useToasts } from '../ui'
import { toISODate, occursOn, todayISO } from '../../lib/time'
import { ItemModal } from '../items/ItemModal'

export const PRIORITY_COLOR: Record<string, string> = {
  lowest: 'var(--ink-faint)',
  low: 'var(--c4)',
  medium: 'var(--info)',
  high: 'var(--warn)',
  highest: 'var(--bad)'
}

export function statusColor(db: WorkspaceDatabase | null, statusId: string): string {
  const s = db?.statuses.find((x) => x.id === statusId)
  return s?.color ?? 'var(--ink-muted)'
}

export function useDbItems(db: WorkspaceDatabase | null) {
  const items = useItemsStore((s) => s.items)
  return useMemo(() => {
    const list = Object.values(items).filter((i) => i.databaseId === (db?.id ?? null))
    return list.sort((a, b) => a.rank - b.rank)
  }, [items, db?.id])
}

function propertyLabel(db: WorkspaceDatabase | null, key: string): string {
  if (key === 'title') return 'Title'
  if (key.startsWith('cf:')) {
    const p = db?.properties.find((x) => `cf:${x.id}` === key)
    return p?.name ?? 'Property'
  }
  return key
}

function propertyValue(item: WorkspaceItem, db: WorkspaceDatabase | null, key: string): unknown {
  if (key.startsWith('cf:')) return item.customFields[key.slice(3)]
  return (item as unknown as Record<string, unknown>)[key]
}

function CellText({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-ink-faint">—</span>
  if (Array.isArray(value)) return <span>{(value as string[]).join(', ') || '—'}</span>
  if (typeof value === 'boolean') return value ? '✓' : '—'
  return <span>{String(value)}</span>
}

// ===========================================================================
// TABLE VIEW
// ===========================================================================

export function TableView({
  db,
  items,
  fields,
  onEdit,
  onAdd
}: {
  db: WorkspaceDatabase | null
  items: WorkspaceItem[]
  fields: FieldDef[]
  onEdit: (i: WorkspaceItem) => void
  onAdd: () => void
}) {
  const updateItem = useItemsStore((s) => s.updateItem)
  const cols = fields.filter((f) => f.key !== 'status')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.9em]">
        <thead>
          <tr className="border-b border-line text-left text-[0.78em] uppercase tracking-wider text-ink-faint">
            <th className="px-2 py-2 font-semibold">Title</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2 font-semibold">
                {propertyLabel(db, c.key)}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="group border-b border-line/50 hover:bg-surface/40">
              <td className="px-2 py-1.5">
                <button
                  className="focus-ring max-w-60 truncate rounded text-left font-medium hover:text-primary"
                  onClick={() => onEdit(it)}
                >
                  {it.title}
                </button>
              </td>
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-1.5">
                  <CellEditor item={it} field={c} db={db} onChange={(v) => void updateItem(it.id, { [c.key.startsWith('cf:') ? 'customFields' : c.key]: c.key.startsWith('cf:') ? { ...it.customFields, [c.key.slice(3)]: v } : v })} />
                </td>
              ))}
              <td className="px-1 py-1.5 text-right">
                <IconBtn label={`Edit ${it.title}`} className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(it)}>
                  <Plus size={12} />
                </IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="p-4">
          <EmptyState title="No items" hint="Add the first item to this database." action={undefined} />
        </div>
      )}
      <div className="p-2">
        <button className="focus-ring flex items-center gap-1.5 rounded-token-sm px-2 py-1.5 text-[0.85em] text-ink-muted hover:bg-surface hover:text-ink" onClick={onAdd}>
          <Plus size={14} /> Add item
        </button>
      </div>
    </div>
  )
}

function CellEditor({
  item,
  field,
  db,
  onChange
}: {
  item: WorkspaceItem
  field: FieldDef
  db: WorkspaceDatabase | null
  onChange: (v: unknown) => void
}) {
  const value = propertyValue(item, db, field.key)
  const [open, setOpen] = useState(false)
  if (field.kind === 'select' && field.key === 'status') {
    return (
      <StatusPill small color={statusColor(db, String(value ?? ''))} label={String(db?.statuses.find((s) => s.id === value)?.name ?? value ?? '—')} />
    )
  }
  return (
    <span className="relative inline-block">
      <button
        className="focus-ring max-w-44 truncate rounded px-1 py-0.5 text-left hover:bg-surface"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={`Edit ${field.label}`}
      >
        {field.kind === 'bool' ? (
          <span>{value ? '✓' : '○'}</span>
        ) : (
          <CellText value={value} />
        )}
      </button>
      {open && (
        <div className="elev-overlay absolute left-0 top-full z-40 mt-1 w-52 rounded-token border border-line bg-raised p-2">
          {field.kind === 'select' ? (
            <select
              className="focus-ring h-8 w-full rounded-token-sm border border-line bg-surface px-2 text-[0.85em]"
              value={String(value ?? '')}
              onChange={(e) => {
                onChange(e.target.value)
                setOpen(false)
              }}
              autoFocus
            >
              <option value="">—</option>
              {db?.properties
                .filter((p) => `cf:${p.id}` === field.key)
                .flatMap((p) => p.options ?? [])
                .map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
            </select>
          ) : field.kind === 'date' ? (
            <input
              type="date"
              className="focus-ring h-8 w-full rounded-token-sm border border-line bg-surface px-2 text-[0.85em]"
              value={String(value ?? '')}
              autoFocus
              onChange={(e) => onChange(e.target.value || undefined)}
              onBlur={() => setOpen(false)}
            />
          ) : field.kind === 'number' ? (
            <input
              type="number"
              className="focus-ring h-8 w-full rounded-token-sm border border-line bg-surface px-2 text-[0.85em]"
              value={String(value ?? '')}
              autoFocus
              onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              onBlur={() => setOpen(false)}
            />
          ) : field.kind === 'bool' ? (
            <button
              className="focus-ring w-full rounded-token-sm px-2 py-1 text-left text-[0.85em] hover:bg-surface"
              onClick={() => {
                onChange(!value)
                setOpen(false)
              }}
            >
              {value ? '✓ checked' : '○ unchecked'}
            </button>
          ) : (
            <input
              className="focus-ring h-8 w-full rounded-token-sm border border-line bg-surface px-2 text-[0.85em]"
              value={String(value ?? '')}
              autoFocus
              onChange={(e) => onChange(e.target.value || undefined)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(false)}
            />
          )}
        </div>
      )}
    </span>
  )
}

// ===========================================================================
// BOARD VIEW (kanban + scrum, WIP limits, swimlanes)
// ===========================================================================

export function BoardView({
  db,
  items,
  onEdit,
  onAdd
}: {
  db: WorkspaceDatabase | null
  items: WorkspaceItem[]
  onEdit: (i: WorkspaceItem) => void
  onAdd: (statusId?: string) => void
}) {
  const sprints = useItemsStore((s) => s.sprints)
  const wipLimit = db?.views.find((v) => v.id === activeViewId(db))?.wipLimit
  const swimlane = db?.views.find((v) => v.id === activeViewId(db))?.swimlane ?? 'none'
  const push = useToasts((s) => s.push)

  const statuses = db?.statuses ?? DEFAULT_STATUSES
  const activeSprint = useMemo(() => {
    if (!db) return null
    const today = todayISO()
    return Object.values(sprints).find((s) => s.databaseId === db.id && s.start <= today && s.end >= today) ?? null
  }, [sprints, db])

  const visible = useMemo(() => {
    const view = db?.views.find((v) => v.id === activeViewId(db))
    if (view?.sprintOnly && db && activeSprint) return items.filter((i) => i.sprintId === activeSprint.id)
    return items
  }, [items, db, activeSprint])

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over) return
    const overCol = String(over.id)
    const me = items.find((i) => i.id === String(active.id))
    if (!me || me.status === overCol) return
    const targetCol = statuses.find((s) => s.id === overCol)
    if (!targetCol) return
    if (wipLimit) {
      const count = visible.filter((i) => i.status === overCol).length
      if (count >= wipLimit) {
        push(`WIP limit: “${targetCol.name}” is full (${wipLimit})`, 'error')
        return
      }
    }
    void useItemsStore.getState().setItemStatus(me.id, overCol)
  }

  const laneOf = (i: WorkspaceItem): string => {
    if (swimlane === 'assignee') return i.assignee || 'Unassigned'
    if (swimlane === 'epic') {
      const parent = items.find((x) => x.id === i.parentId)
      return parent ? parent.title : 'No epic'
    }
    return ''
  }

  return (
    <DndContext sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((st) => {
          const colItems = visible
            .filter((i) => i.status === st.id)
            .sort((a, b) => a.rank - b.rank)
          const over = wipLimit ? colItems.length >= wipLimit : false
          return (
            <div key={st.id} className="flex w-64 shrink-0 flex-col">
              <div
                className={`mb-2 flex items-center justify-between px-1 ${over ? 'text-bad' : 'text-ink-muted'}`}
              >
                <span className="flex items-center gap-1.5 text-[0.85em] font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
                  {st.name}
                  {db && db.id === 'none' && null}
                </span>
                <span className={`text-[0.75em] tabular-nums ${over ? 'font-bold' : 'text-ink-faint'}`}>
                  {colItems.length}
                  {wipLimit ? `/${wipLimit}` : ''}
                </span>
              </div>
              <ColumnDrop
                columnId={st.id}
                count={colItems.length}
                wipLimit={wipLimit}
                items={colItems}
                laneOf={laneOf}
                onEdit={onEdit}
                onAdd={() => onAdd(st.id)}
              />
            </div>
          )
        })}
      </div>
      {viewSprintHint(db, activeSprint)}
    </DndContext>
  )
}

function viewSprintHint(db: WorkspaceDatabase | null, sprint: { id: string; name: string; start: string; end: string } | null) {
  const view = db?.views.find((v) => v.id === activeViewId(db))
  if (!view?.sprintOnly || !db) return null
  if (!sprint)
    return (
      <div className="mt-2 rounded-token border border-warn/40 bg-warn/10 px-3 py-2 text-[0.85em] text-warn">
        No active sprint. Create one in “Sprints” to see this board.
      </div>
    )
  return (
    <div className="mt-2 text-[0.8em] text-ink-faint">
      Showing active sprint: <strong className="text-ink-muted">{sprint.name}</strong> ({sprint.start} → {sprint.end})
    </div>
  )
}

function ColumnDrop({
  columnId,
  count,
  wipLimit,
  items,
  laneOf,
  onEdit,
  onAdd
}: {
  columnId: string
  count: number
  wipLimit?: number
  items: WorkspaceItem[]
  laneOf: (i: WorkspaceItem) => string
  onEdit: (i: WorkspaceItem) => void
  onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const over = wipLimit ? count >= wipLimit : false
  const lanes = useMemo(() => {
    const m = new Map<string, WorkspaceItem[]>()
    for (const i of items) {
      const lane = laneOf(i)
      if (!lane) continue
      ;(m.get(lane) ?? m.set(lane, []).get(lane)!).push(i)
    }
    return [...m.entries()]
  }, [items, laneOf])

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 space-y-1.5 rounded-token border p-1.5 transition-colors ${
        isOver ? (over ? 'border-bad bg-bad/10' : 'border-primary bg-primary/5') : 'border-transparent'
      }`}
    >
      {lanes.map(([lane, laneItems]) => (
        <SortableContext key={lane} items={laneItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="mb-1 mt-1 flex items-center gap-1 px-1 text-[0.7em] font-semibold uppercase tracking-wider text-ink-faint first:mt-0">
            {lane}
            <span className="h-px flex-1 bg-line" />
          </div>
          {laneItems.map((i) => (
            <BoardCard key={i.id} item={i} onEdit={onEdit} />
          ))}
        </SortableContext>
      ))}
      {lanes.length === 0 &&
        items.map((i) => (
          <BoardCard key={i.id} item={i} onEdit={onEdit} />
        ))}
      {items.length === 0 && (
        <div className="rounded-token border border-dashed border-line px-2 py-4 text-center text-[0.78em] text-ink-faint">
          Drop items here
        </div>
      )}
      <button
        className="focus-ring mt-1 flex w-full items-center gap-1 rounded-token-sm px-2 py-1.5 text-left text-[0.8em] text-ink-faint hover:bg-surface hover:text-ink"
        onClick={onAdd}
      >
        <Plus size={12} /> Add
      </button>
    </div>
  )
}

export function BoardCard({ item, onEdit }: { item: WorkspaceItem; onEdit: (i: WorkspaceItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const db = useItemsStore((s) => s.databases[item.databaseId ?? ''])
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`elev-raised rounded-token border border-line bg-raised p-2.5 ${isDragging ? 'opacity-60' : ''}`}
      {...attributes}
      {...listeners}
    >
      <button className="focus-ring w-full text-left" onClick={(e) => e.stopPropagation()} onDoubleClick={() => onEdit(item)}>
        <span className="block text-[0.9em] font-medium leading-snug">{item.title}</span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusPill small color={statusColor(db || null, item.status)} label={db?.statuses.find((s) => s.id === item.status)?.name ?? item.status} />
        <span
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[0.68em] font-semibold"
          style={{ color: PRIORITY_COLOR[item.priority], background: 'var(--sunken)' }}
        >
          <Flag size={9} />
          {item.priority}
        </span>
        {item.dueDate && (
          <span className={`flex items-center gap-0.5 text-[0.68em] ${item.dueDate < todayISO() ? 'text-bad' : 'text-ink-faint'}`}>
            <Clock3 size={9} />
            {item.dueDate.slice(5)}
          </span>
        )}
        {item.labels.map((l) => (
          <span key={l} className="flex items-center gap-0.5 rounded-sm bg-sunken px-1 py-0.5 text-[0.68em] text-ink-muted">
            <Tag size={9} />
            {l}
          </span>
        ))}
        {item.storyPoints != null && (
          <span className="ml-auto rounded-full bg-primary-soft px-1.5 text-[0.68em] font-bold text-primary">
            {item.storyPoints}
          </span>
        )}
      </div>
    </div>
  )
}

// ===========================================================================
// LIST VIEW (rank-ordered, drag to reorder)
// ===========================================================================

export function ListView({
  db,
  items,
  onEdit,
  onAdd
}: {
  db: WorkspaceDatabase | null
  items: WorkspaceItem[]
  onEdit: (i: WorkspaceItem) => void
  onAdd: () => void
}) {
  const reorderItem = useItemsStore((s) => s.reorderItem)
  const context = { databaseId: db?.id ?? null }
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    void reorderItem(String(active.id), String(over.id), context)
  }
  return (
    <div>
      <DndContext sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {items.map((i) => (
              <ListRow key={i.id} item={i} onEdit={onEdit} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {items.length === 0 && <EmptyState title="No items" hint="Add an item to get started." />}
      <div className="p-2">
        <button className="focus-ring flex items-center gap-1.5 rounded-token-sm px-2 py-1.5 text-[0.85em] text-ink-muted hover:bg-surface hover:text-ink" onClick={onAdd}>
          <Plus size={14} /> Add item
        </button>
      </div>
    </div>
  )
}

function ListRow({ item, onEdit }: { item: WorkspaceItem; onEdit: (i: WorkspaceItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const db = useItemsStore((s) => s.databases[item.databaseId ?? ''])
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-token-sm px-2 py-1.5 hover:bg-surface/50"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-ink-faint hover:text-ink" aria-label="Drag to reorder">
        
      </span>
      <button className="focus-ring min-w-0 flex-1 truncate rounded text-left text-[0.92em]" onClick={() => onEdit(item)}>
        {item.title}
      </button>
      <StatusPill small color={statusColor(db || null, item.status)} label={db?.statuses.find((s) => s.id === item.status)?.name ?? item.status} />
      <span className="w-14 text-right text-[0.75em] text-ink-faint">{item.priority}</span>
      {item.dueDate && (
        <span className={`w-16 text-right text-[0.75em] tabular-nums ${item.dueDate < todayISO() ? 'text-bad' : 'text-ink-faint'}`}>
          {item.dueDate.slice(5)}
        </span>
      )}
    </div>
  )
}

// ===========================================================================
// CALENDAR VIEW — one engine: item due dates + habit recurrences + alarms +
// manual events (§7). Used by Workspace views and the Calendar page.
// ===========================================================================

export interface CalendarSources {
  items?: WorkspaceItem[]
  habits?: WorkspaceItem[]
  alarms?: { id: string; title: string; at: string }[]
  events?: CalEvent[]
}

export function CalendarView({
  month,
  onMonth,
  sources,
  compact = false,
  onPickItem
}: {
  month: Date
  onMonth: (m: Date) => void
  sources: CalendarSources
  compact?: boolean
  onPickItem?: (i: WorkspaceItem) => void
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const year = month.getFullYear()
  const mon = month.getMonth()
  const first = new Date(year, mon, 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, mon, i + 1))
  ]

  const dayItems = (iso: string) => (sources.items ?? []).filter((i) => i.dueDate === iso)
  const dayHabits = (d: Date) => (sources.habits ?? []).filter((h) => occursOn(h.recurrence, d))
  const dayAlarms = (iso: string) => (sources.alarms ?? []).filter((a) => a.at.startsWith(iso))
  const dayEvents = (iso: string) => (sources.events ?? []).filter((e) => e.at.startsWith(iso))


  return (
    <div className={compact ? '' : 'grid gap-4 lg:grid-cols-[1fr_280px]'}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[1.05em] font-semibold">
            {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-1">
            <IconBtn label="Previous month" onClick={() => onMonth(new Date(year, mon - 1, 1))}>
              <ChevronLeft size={15} />
            </IconBtn>
            <button
              className="focus-ring rounded-token-sm px-2 py-1 text-[0.8em] text-ink-muted hover:bg-surface hover:text-ink"
              onClick={() => onMonth(new Date())}
            >
              Today
            </button>
            <IconBtn label="Next month" onClick={() => onMonth(new Date(year, mon + 1, 1))}>
              <ChevronRight size={15} />
            </IconBtn>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[0.72em] font-semibold uppercase tracking-wider text-ink-faint">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d)
              return (
                <div key={i} className={`rounded-token ${compact ? 'min-h-14' : 'min-h-20'} bg-transparent`} />
              )
            const iso = toISODate(d)
            const isToday = iso === todayISO()
            const nItems = dayItems(iso).length
            const nHabits = dayHabits(d).length
            const nAlarms = dayAlarms(iso).length
            const nEvents = dayEvents(iso).length
            const sel = selectedDay === iso
            return (
              <button
                key={i}
                className={`focus-ring group flex flex-col items-start gap-0.5 rounded-token border p-1 text-left transition-colors ${
                  sel
                    ? 'border-primary bg-primary/10'
                    : isToday
                      ? 'border-primary/50 bg-surface/70'
                      : 'border-line bg-surface/30 hover:bg-surface/60'
                } ${compact ? 'min-h-14' : 'min-h-20'}`}
                onClick={() => setSelectedDay(iso)}
                aria-label={`${iso}: ${nItems} due, ${nHabits} habits, ${nAlarms} alarms, ${nEvents} events`}
              >
                <span
                  className={`rounded-full px-1.5 text-[0.72em] tabular-nums ${
                    isToday ? 'bg-primary font-bold text-primary-on' : 'text-ink-muted'
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="flex w-full flex-wrap gap-0.5">
                  {nItems > 0 && (
                    <span className="rounded-sm bg-primary/25 px-1 text-[0.62em] font-medium text-primary">
                      {nItems} due
                    </span>
                  )}
                  {nHabits > 0 && (
                    <span className="rounded-sm bg-ok/20 px-1 text-[0.62em] text-ok">{nHabits} habits</span>
                  )}
                  {nAlarms > 0 && (
                    <span className="rounded-sm bg-warn/20 px-1 text-[0.62em] text-warn">⏰ {nAlarms}</span>
                  )}
                  {nEvents > 0 && (
                    <span className="rounded-sm bg-info/20 px-1 text-[0.62em] text-info">{nEvents}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {!compact && selectedDay && (
        <div className="rounded-token border border-line bg-surface/40 p-3">
          <div className="mb-2 text-[0.9em] font-semibold">{selectedDay}</div>
          <ul className="space-y-1.5">
            {dayItems(selectedDay).map((i) => (
              <li key={i.id}>
                <button
                  className="focus-ring flex w-full items-center gap-2 rounded-token-sm px-2 py-1.5 text-left text-[0.85em] hover:bg-surface"
                  onClick={() => onPickItem?.(i)}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="flex-1 truncate">{i.title}</span>
                  <span className="text-[0.7em] text-ink-faint">due</span>
                </button>
              </li>
            ))}
            {dayEvents(selectedDay).map((e) => (
              <li key={e.id}>
                <div className="flex items-center gap-2 rounded-token-sm px-2 py-1.5 text-[0.85em]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-info" />
                  <span className="flex-1 truncate">{e.title}</span>
                </div>
              </li>
            ))}
            {dayAlarms(selectedDay).map((a) => (
              <li key={a.id}>
                <div className="flex items-center gap-2 rounded-token-sm px-2 py-1.5 text-[0.85em]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-warn" />
                  <span className="flex-1 truncate">{a.title}</span>
                  <span className="text-[0.7em] tabular-nums text-ink-faint">
                    {a.at.slice(11, 16)}
                  </span>
                </div>
              </li>
            ))}
            {dayHabits(new Date(selectedDay + 'T12:00:00')).map((h) => (
              <li key={h.id}>
                <div className="flex items-center gap-2 rounded-token-sm px-2 py-1.5 text-[0.85em]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
                  <span className="flex-1 truncate">{h.title}</span>
                  <span className="text-[0.7em] text-ink-faint">habit</span>
                </div>
              </li>
            ))}
            {dayItems(selectedDay).length + dayEvents(selectedDay).length + dayAlarms(selectedDay).length + dayHabits(new Date(selectedDay + 'T12:00:00')).length === 0 && (
              <li className="px-2 py-3 text-center text-[0.8em] text-ink-faint">Nothing scheduled</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// TIMELINE VIEW (Gantt-style)
// ===========================================================================

export function TimelineView({ db, items }: { db: WorkspaceDatabase | null; items: WorkspaceItem[] }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const withDates = items.filter((i) => i.dueDate)
  if (withDates.length === 0)
    return <EmptyState icon={<CalendarDays size={20} />} title="No dated items" hint="Give items a due date to see the timeline." />
  const minD = Math.min(...withDates.map((i) => new Date(i.startDate ?? i.dueDate!).getTime()))
  const maxD = Math.max(...withDates.map((i) => new Date(i.dueDate!).getTime()))
  const span = Math.max(7, (maxD - minD) / 86400000)
  const start = new Date(minD - 3 * 86400000)
  const end = new Date(start.getTime() + (span + 3) * 86400000)
  const pct = (t: number) => `${((t - start.getTime()) / (end.getTime() - start.getTime())) * 100}%`
  const pos = (d: string) => pct(new Date(d).getTime())
  const width = (a: string, b: string) =>
    `${Math.max(1.5, ((new Date(b).getTime() - new Date(a).getTime()) / (end.getTime() - start.getTime())) * 100)}%`
  const todayPct = pos(todayISO())

  // §16.2 ruler — month bands, or week bands when the span is short
  const useWeeks = span < 60
  const bands: { label: string; left: string; right: string }[] = []
  if (useWeeks) {
    const d = new Date(start)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
    while (d.getTime() < end.getTime()) {
      const wEnd = new Date(d.getTime() + 7 * 86400000)
      const l = Math.max(start.getTime(), d.getTime())
      const r = Math.min(end.getTime(), wEnd.getTime())
      if (r > l)
        bands.push({
          label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          left: pct(l),
          right: pct(r)
        })
      d.setTime(wEnd.getTime())
    }
  } else {
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d.getTime() < end.getTime()) {
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
      const l = Math.max(start.getTime(), d.getTime())
      const r = Math.min(end.getTime(), mEnd)
      if (r > l)
        bands.push({
          label: d.toLocaleDateString([], { month: 'short', year: '2-digit' }),
          left: pct(l),
          right: pct(r)
        })
      d.setMonth(d.getMonth() + 1)
    }
  }

  // §16.2 filter chips (status) — dataset-level for this view
  const visible = statusFilter ? withDates.filter((i) => i.status === statusFilter) : withDates
  const statuses = db?.statuses ?? []
  const countFor = (id: string) => withDates.filter((i) => i.status === id).length

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            className={`focus-ring rounded-token-full border px-2.5 py-0.5 text-[0.75em] ${
              statusFilter === null ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted hover:border-line-strong'
            }`}
            onClick={() => setStatusFilter(null)}
            aria-pressed={statusFilter === null}
          >
            All ({withDates.length})
          </button>
          {statuses.map((s) => (
            <button
              key={s.id}
              className={`focus-ring rounded-token-full border px-2.5 py-0.5 text-[0.75em] ${
                statusFilter === s.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted hover:border-line-strong'
              }`}
              onClick={() => setStatusFilter(statusFilter === s.id ? null : s.id)}
              aria-pressed={statusFilter === s.id}
              disabled={countFor(s.id) === 0 && statusFilter !== s.id}
            >
              {s.name} ({countFor(s.id)})
            </button>
          ))}
        </div>
        <div className="relative">
          <div className="relative h-6 border-b border-line">
            {bands.map((b, i) => (
              <div
                key={i}
                className="absolute bottom-0 top-0 flex items-center overflow-hidden border-l border-line pl-1"
                style={{ left: b.left, width: `calc(${b.right} - ${b.left})` }}
                aria-hidden
              >
                <span className="truncate font-mono text-[0.62em] text-ink-faint">{b.label}</span>
              </div>
            ))}
            <div className="absolute bottom-0 top-0 z-10 w-px bg-bad/70" style={{ left: todayPct }} aria-hidden>
              <span
                className="absolute -top-0.5 left-1 font-mono text-[0.58em] font-semibold"
                style={{ color: 'var(--bad)' }}
              >
                today
              </span>
            </div>
          </div>
          <div className="space-y-1.5 py-2">
            {visible.map((i) => (
              <div key={i.id} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-[0.85em]">{i.title}</span>
                <div className="relative h-5 flex-1 rounded-sm bg-sunken">
                  <div
                    className="absolute top-0.5 h-4 rounded-sm"
                    style={{
                      left: pos(i.startDate ?? i.dueDate!),
                      width: width(i.startDate ?? i.dueDate!, i.dueDate!),
                      background: statusColor(db, i.status),
                      opacity: 0.85
                    }}
                    title={`${i.title}: ${i.startDate ?? i.dueDate} → ${i.dueDate}`}
                  />
                  <div className="absolute bottom-0 top-0 w-px bg-bad/70" style={{ left: todayPct }} aria-hidden />
                </div>
                <span className="w-20 shrink-0 text-right text-[0.72em] tabular-nums text-ink-faint">{i.dueDate}</span>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="py-3 text-center text-[0.85em] text-ink-faint">No dated items with this status.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// GALLERY VIEW
// ===========================================================================

export function GalleryView({
  db,
  items,
  onEdit,
  onAdd
}: {
  db: WorkspaceDatabase | null
  items: WorkspaceItem[]
  onEdit: (i: WorkspaceItem) => void
  onAdd: () => void
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map((i) => (
          <button
            key={i.id}
            className="focus-ring elev-raised group overflow-hidden rounded-token border border-line bg-raised text-left"
            onClick={() => onEdit(i)}
          >
            <div className="flex h-24 items-center justify-center bg-sunken">
              {i.cover ? (
                <img src={i.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={22} className="text-ink-faint" />
              )}
            </div>
            <div className="p-2.5">
              <div className="truncate text-[0.9em] font-medium group-hover:text-primary">{i.title}</div>
              <div className="mt-1.5 flex items-center justify-between">
                <StatusPill
                  small
                  color={statusColor(db, i.status)}
                  label={db?.statuses.find((s) => s.id === i.status)?.name ?? i.status}
                />
                <span className="text-[0.7em] text-ink-faint">{i.priority}</span>
              </div>
            </div>
          </button>
        ))}
        <button
          className="focus-ring flex min-h-40 flex-col items-center justify-center gap-1 rounded-token border border-dashed border-line text-ink-faint hover:border-primary hover:text-primary"
          onClick={onAdd}
        >
          <Plus size={18} />
          <span className="text-[0.8em]">Add item</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export const DEFAULT_STATUSES = [
  { id: 'backlog', name: 'Backlog', color: 'var(--ink-faint)', isBacklog: true },
  { id: 'todo', name: 'To do', color: 'var(--info)' },
  { id: 'doing', name: 'In progress', color: 'var(--warn)' },
  { id: 'done', name: 'Done', color: 'var(--ok)', isDone: true }
]

export function activeViewId(db: WorkspaceDatabase | null): string {
  if (!db) return ''
  try {
    const saved = localStorage.getItem(`elion-db-view-${db.id}`)
    if (saved && db.views.some((v) => v.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return db.views[0]?.id ?? ''
}

export function useDbFields(db: WorkspaceDatabase | null): FieldDef[] {
  return useMemo(() => fieldsFor(db?.properties ?? []), [db?.properties])
}

export function useItemModal() {
  const [editing, setEditing] = useState<WorkspaceItem | null>(null)
  const [creating, setCreating] = useState<Partial<WorkspaceItem> | null>(null)
  return {
    open: editing !== null || creating !== null,
    editing,
    creating,
    openEdit: (i: WorkspaceItem) => setEditing(i),
    openCreate: (p?: Partial<WorkspaceItem>) => setCreating(p ?? {}),
    close: () => {
      setEditing(null)
      setCreating(null)
    }
  }
}
