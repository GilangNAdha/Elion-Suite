import { useMemo, useState } from 'react'
import {
  Table2,
  Kanban,
  CalendarDays,
  GanttChartSquare,
  GalleryHorizontalEnd,
  List,
  Plus,
  Settings2,
  Filter,
  Save,
  X,
  CopyPlus
} from 'lucide-react'
import type { ViewKind, WorkspaceDatabase } from '../../lib/types'
import { uid } from '../../lib/types'
import { applyFilter, parseRawQuery, type FieldDef } from '../../lib/filterEngine'
import { useItemsStore } from '../../stores/itemsStore'
import { usePagesStore } from '../../stores/pagesStore'
import { useToasts, Button, IconBtn, Menu, MenuItem, MenuLabel, Input, Kbd } from '../ui'
import {
  TableView,
  BoardView,
  CalendarView,
  TimelineView,
  GalleryView,
  ListView,
  activeViewId,
  useDbItems,
  useDbFields
} from '../views/views'
import type { ViewDef } from '../../lib/types'
import { ItemModal } from './ItemModal'
import { FilterBuilder } from './FilterBuilder'
import { DBSettings } from './DBSettings'
import { SprintPanel } from './SprintPanel'
import { toISODate } from '../../lib/time'

const VIEW_ICON: Record<ViewKind, typeof Table2> = {
  table: Table2,
  board: Kanban,
  calendar: CalendarDays,
  timeline: GanttChartSquare,
  gallery: GalleryHorizontalEnd,
  list: List
}

export function DatabaseBlock({ dbId, compact = false }: { dbId: string; compact?: boolean }) {
  const db = useItemsStore((s) => s.databases[dbId])
  const upsertDatabase = useItemsStore((s) => s.upsertDatabase)
  const items = useDbItems(db ?? null)
  const fields = useDbFields(db ?? null)
  const savedFiltersAll = usePagesStore((s) => s.savedFilters)
  const savedFilters = useMemo(
    () => savedFiltersAll.filter((f) => f.databaseId === dbId),
    [savedFiltersAll, dbId]
  )
  const push = useToasts((s) => s.push)

  const [search, setSearch] = useState('')
  const [viewId, setViewId] = useState<string>(() => activeViewId(db ?? null))
  const [month, setMonth] = useState(new Date())
  const [activeFilter, setActiveFilter] = useState<{
    name: string
    query: ReturnType<typeof parseRawQuery>
  } | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sprintOpen, setSprintOpen] = useState(false)
  const [editing, setEditing] = useState<import('../../lib/types').WorkspaceItem | null>(null)
  const [creating, setCreating] = useState<Partial<import('../../lib/types').WorkspaceItem> | null>(null)

  const view: ViewDef | undefined = db?.views.find((v) => v.id === viewId) ?? db?.views[0]

  const filtered = useMemo(() => {
    const list = activeFilter?.query ? applyFilter(items, activeFilter.query, fields) : items
    const needle = search.toLocaleLowerCase().trim()
    return needle
      ? list.filter((i) =>
          `${i.title} ${i.description} ${i.labels.join(' ')}`.toLocaleLowerCase().includes(needle)
        )
      : list
  }, [items, activeFilter, fields, search])

  if (!db) {
    // never a dead end: recreate the database record under the SAME id so the
    // block pointing at it works again (previous contents are already gone)
    const recreate = () => {
      void upsertDatabase({
        id: dbId,
        pageId: '',
        name: 'Recreated database',
        properties: [],
        statuses: [
          { id: 'backlog', name: 'Backlog', color: 'var(--ink-faint)', isBacklog: true },
          { id: 'todo', name: 'To do', color: 'var(--info)' },
          { id: 'doing', name: 'In progress', color: 'var(--warn)' },
          { id: 'done', name: 'Done', color: 'var(--ok)', isDone: true }
        ],
        views: [
          {
            id: uid(),
            name: 'Board',
            kind: 'board',
            visibleProperties: ['title', 'status', 'priority'],
            swimlane: 'none'
          },
          {
            id: uid(),
            name: 'Table',
            kind: 'table',
            visibleProperties: ['title', 'status', 'priority', 'dueDate']
          }
        ],
        automations: [],
        defaultType: 'task'
      })
      push('Database recreated — add your items back', 'success')
    }
    return (
      <div className="rounded-token border border-dashed border-line p-4 text-center text-[0.85em] text-ink-faint">
        <p>This database record is missing (it was deleted).</p>
        <Button size="sm" variant="soft" className="mt-2" onClick={recreate}>
          Recreate database
        </Button>
      </div>
    )
  }

  const switchView = (id: string) => {
    setViewId(id)
    try {
      localStorage.setItem(`elion-db-view-${db.id}`, id)
    } catch {
      /* ignore */
    }
  }

  const addView = (kind: ViewKind) => {
    const v: ViewDef = {
      id: uid(),
      name: kind[0].toUpperCase() + kind.slice(1),
      kind,
      visibleProperties: ['title', 'status', 'priority'],
      swimlane: 'none',
      wipLimit: kind === 'board' ? 4 : undefined
    }
    void upsertDatabase({ ...db, views: [...db.views, v] })
    setViewId(v.id)
    push(`View “${v.name}” added`, 'success')
  }

  const runSaved = (f: (typeof savedFilters)[number]) => {
    const q = f.query
    setActiveFilter({ name: f.name, query: q })
  }

  const onAdd = (statusId?: string) => setCreating({ status: statusId, type: db.defaultType })

  return (
    <div className={`database-block ${compact ? 'database-compact' : ''}`}>
      <div className={`database-toolbar ${compact ? 'rounded-t-token' : ''}`}>
        <span className="sr-only">{db.name}</span>
        <div className="database-view-tabs" aria-label="Database views">
          {db.views.map((v) => {
            const Icon = VIEW_ICON[v.kind]
            return (
              <button
                key={v.id}
                className={`database-view-tab ${view?.id === v.id ? 'is-active' : ''}`}
                aria-pressed={view?.id === v.id}
                onClick={() => switchView(v.id)}
              >
                <Icon size={13} />
                {v.name}
              </button>
            )
          })}
          <Menu
            width={190}
            align="down-start"
            trigger={
              <span
                className="focus-ring flex h-6 w-6 items-center justify-center rounded-token-sm text-ink-faint hover:bg-surface hover:text-ink"
                aria-label="Add view"
              >
                <Plus size={13} />
              </span>
            }
          >
            <MenuLabel>Add view</MenuLabel>
            {(Object.keys(VIEW_ICON) as ViewKind[]).map((k) => {
              const VIcon = VIEW_ICON[k]
              return <MenuItem key={k} icon={<VIcon size={13} />} label={k} onClick={() => addView(k)} />
            })}
          </Menu>
        </div>
        <span className="flex-1" />
        <Menu
          width={240}
          align="down-end"
          trigger={
            <span
              className="focus-ring flex items-center gap-1 rounded-token-sm px-2 py-1 text-[0.8em] text-ink-muted hover:bg-surface hover:text-ink"
              aria-label="Filters"
            >
              <Filter size={13} />
              {activeFilter ? (
                <span className="max-w-28 truncate text-primary">{activeFilter.name}</span>
              ) : (
                <span>Filter</span>
              )}
            </span>
          }
        >
          <MenuItem label="Open query builder" onClick={() => setBuilderOpen(true)} />
          <MenuLabel>Saved filters</MenuLabel>
          {savedFilters.length === 0 && (
            <div className="px-2 py-1 text-[0.78em] text-ink-faint">None saved</div>
          )}
          {savedFilters.map((f) => (
            <MenuItem key={f.id} label={f.name} onClick={() => runSaved(f)} />
          ))}
          {activeFilter && (
            <MenuItem label="Clear active filter" danger onClick={() => setActiveFilter(null)} />
          )}
        </Menu>
        <IconBtn label="Sprints & reports" onClick={() => setSprintOpen(true)}>
          <GanttChartSquare size={15} />
        </IconBtn>
        <IconBtn label="Database settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} />
        </IconBtn>
        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => onAdd()}>
          Add item
        </Button>
      </div>

      {!compact && (
        <div className="database-subtoolbar">
          <input
            className="board-search"
            aria-label="Search database items"
            placeholder="Find an item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>
            <b>{filtered.length}</b> items
          </span>
          <span className="database-local">Changes saved on this device</span>
        </div>
      )}
      {activeFilter && !compact && (
        <div className="flex items-center gap-2 border-b border-line bg-primary/5 px-3 py-1.5 text-[0.8em] text-ink-muted">
          <Filter size={12} className="text-primary" />
          <span>
            Filter: <strong>{activeFilter.name}</strong> / {filtered.length} of {items.length}
          </span>
          <button
            className="focus-ring ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface"
            onClick={() => setActiveFilter(null)}
          >
            <X size={11} /> Clear
          </button>
        </div>
      )}

      <div className={compact ? '' : 'database-view-content'}>
        {view?.kind === 'table' && (
          <TableView
            db={db}
            items={filtered}
            fields={fields}
            onEdit={(i) => setEditing(i)}
            onAdd={() => onAdd()}
          />
        )}
        {view?.kind === 'board' && (
          <BoardView db={db} items={filtered} onEdit={(i) => setEditing(i)} onAdd={onAdd} />
        )}
        {view?.kind === 'calendar' && (
          <CalendarView
            month={month}
            onMonth={setMonth}
            sources={{ items: filtered }}
            compact={compact}
            onPickItem={(i) => setEditing(i)}
          />
        )}
        {view?.kind === 'timeline' && <TimelineView db={db} items={filtered} />}
        {view?.kind === 'gallery' && (
          <GalleryView db={db} items={filtered} onEdit={(i) => setEditing(i)} onAdd={() => onAdd()} />
        )}
        {view?.kind === 'list' && (
          <ListView db={db} items={filtered} onEdit={(i) => setEditing(i)} onAdd={() => onAdd()} />
        )}
      </div>

      {(editing || creating) && (
        <ItemModal
          db={db}
          databaseId={db.id}
          editing={editing}
          creating={creating}
          onClose={() => {
            setEditing(null)
            setCreating(null)
          }}
        />
      )}
      {builderOpen && (
        <FilterBuilder
          db={db}
          databaseId={db.id}
          fields={fields}
          onClose={() => setBuilderOpen(false)}
          onApply={(name, query) => {
            setActiveFilter({ name, query })
          }}
        />
      )}
      {settingsOpen && <DBSettings db={db} onClose={() => setSettingsOpen(false)} />}
      {sprintOpen && <SprintPanel db={db} items={items} onClose={() => setSprintOpen(false)} />}
    </div>
  )
}

export function DatabasePageBlock({ dbId }: { dbId: string }) {
  return <DatabaseBlock dbId={dbId} />
}

export { toISODate, CopyPlus, Save, Kbd }
