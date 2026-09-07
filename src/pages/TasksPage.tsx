import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Filter, X } from 'lucide-react'
import type { WorkspaceItem } from '../lib/types'
import { uid } from '../lib/types'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { applyFilter } from '../lib/filterEngine'
import { BoardView, ListView, DEFAULT_STATUSES, useDbFields } from '../components/views/views'
import { ItemModal } from '../components/items/ItemModal'
import { FilterBuilder } from '../components/items/FilterBuilder'
import { Button, Tabs, Menu, MenuItem, EmptyState } from '../components/ui'

/**
 * Tasks — a saved Board/List view over WorkspaceItem records that live
 * outside any formal project (databaseId: null). Same item model, one
 * `items` store (§7).
 */
export function TasksPage() {
  const items = useItemsStore((s) => s.items)
  const filters = usePagesStore((s) => s.savedFilters)
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'board' | 'list'>('board')
  const fields = useDbFields(null)
  const [editing, setEditing] = useState<WorkspaceItem | null>(null)
  const [creating, setCreating] = useState<Partial<WorkspaceItem> | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)

  const activeFilterId = params.get('filter')
  const activeFilter = filters.find((f) => f.id === activeFilterId && f.databaseId === null)

  const unassigned = useMemo(
    () =>
      Object.values(items)
        .filter((i) => i.databaseId === null)
        .sort((a, b) => a.rank - b.rank),
    [items]
  )
  const visible = useMemo(
    () => (activeFilter ? applyFilter(unassigned, activeFilter.query, fields) : unassigned),
    [unassigned, activeFilter, fields]
  )

  const onAdd = (status?: string) => setCreating({ type: 'task', status: status ?? 'todo' })

  return (
    <div className="mx-auto max-w-7xl p-6 pb-24">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[1.7em] font-bold tracking-tight">Tasks</h1>
          <p className="text-[0.88em] text-ink-muted">
            Personal tasks outside any Workspace project — the same item model powers boards, habits, and the calendar.
          </p>
        </div>
        <span className="flex-1" />
        <Menu
          width={220}
          align="down-end"
          trigger={
            <Button variant="outline" icon={<Filter size={14} />}>
              {activeFilter ? activeFilter.name : 'Filter'}
            </Button>
          }
        >
          <MenuItem label="Open query builder" onClick={() => setBuilderOpen(true)} />
          <MenuItem label="Clear" onClick={() => setParams({})} />
        </Menu>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => onAdd()}>
          New task
        </Button>
      </div>

      {activeFilter && (
        <div className="mb-3 flex items-center gap-2 rounded-token border border-primary/40 bg-primary/5 px-3 py-1.5 text-[0.85em]">
          <Filter size={13} className="text-primary" />
          <span>
            Filter <strong>{activeFilter.name}</strong> · {visible.length} of {unassigned.length}
          </span>
          <button className="focus-ring ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface" onClick={() => setParams({})} aria-label="Clear filter">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'board', label: 'Board' },
            { id: 'list', label: 'List' }
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Plus size={20} />}
          title="No tasks here"
          hint={activeFilter ? 'Try clearing the filter.' : 'Add your first task.'}
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => onAdd()}>
              New task
            </Button>
          }
        />
      ) : view === 'board' ? (
        <BoardView db={null} items={visible} onEdit={(i) => setEditing(i)} onAdd={() => onAdd()} />
      ) : (
        <ListView db={null} items={visible} onEdit={(i) => setEditing(i)} onAdd={() => onAdd()} />
      )}

      {(editing || creating) && (
        <ItemModal db={null} databaseId={null} editing={editing} creating={creating} onClose={() => { setEditing(null); setCreating(null) }} />
      )}
      {builderOpen && (
        <FilterBuilder
          db={null}
          databaseId="unassigned"
          fields={fields}
          onClose={() => setBuilderOpen(false)}
          onApply={(name, query) => {
            void usePagesStore
              .getState()
              .upsertFilter({
                id: uid(),
                name,
                databaseId: null,
                query,
                createdAt: new Date().toISOString()
              })
              .then(() => {
                const f = usePagesStore.getState().savedFilters.at(-1)
                if (f) setParams({ filter: f.id })
              })
          }}
        />
      )}
    </div>
  )
}

