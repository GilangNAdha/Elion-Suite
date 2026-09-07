import { create } from 'zustand'
import { db } from '../lib/db'
import { uid, type Automation, type Sprint, type StatusEvent, type WorkspaceDatabase, type WorkspaceItem } from '../lib/types'
import { useNotifyStore } from './notifyStore'
import { todayISO } from '../lib/time'

interface ItemsState {
  ready: boolean
  items: Record<string, WorkspaceItem>
  sprints: Record<string, Sprint>
  databases: Record<string, WorkspaceDatabase>
  statusHistory: StatusEvent[]
  init: () => Promise<void>

  createItem: (p: Partial<WorkspaceItem> & { title: string }) => Promise<WorkspaceItem>
  updateItem: (id: string, patch: Partial<WorkspaceItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  setItemStatus: (id: string, status: string) => Promise<void>
  moveItemTo: (id: string, databaseId: string | null, status: string) => Promise<void>
  reorderItem: (id: string, beforeId: string | null, context: { databaseId: string | null }) => Promise<void>
  toggleHabitCompletion: (id: string, dateISO: string) => Promise<void>

  upsertSprint: (s: Sprint) => Promise<void>
  deleteSprint: (id: string) => Promise<void>
  upsertDatabase: (d: WorkspaceDatabase) => Promise<void>
  deleteDatabase: (id: string) => Promise<void>
}

const RANK_STEP = 1000

export const useItemsStore = create<ItemsState>()((set, get) => ({
  ready: false,
  items: {},
  sprints: {},
  databases: {},
  statusHistory: [],

  init: async () => {
    const [items, sprints, databases, history] = await Promise.all([
      db.items.toArray(),
      db.sprints.toArray(),
      db.databases.toArray(),
      db.statusHistory.orderBy('at').limit(2000).toArray()
    ])
    set({
      ready: true,
      items: Object.fromEntries(items.map((i) => [i.id, i])),
      sprints: Object.fromEntries(sprints.map((s) => [s.id, s])),
      databases: Object.fromEntries(databases.map((d) => [d.id, d])),
      statusHistory: history
    })
  },

  createItem: async (p) => {
    const now = new Date().toISOString()
    const existing = Object.values(get().items).filter(
      (i) => i.databaseId === (p.databaseId ?? null)
    )
    const item: WorkspaceItem = {
      id: uid(),
      type: p.type ?? 'task',
      title: p.title,
      description: p.description ?? '',
      status: p.status ?? 'todo',
      priority: p.priority ?? 'medium',
      labels: p.labels ?? [],
      databaseId: p.databaseId ?? null,
      sprintId: p.sprintId,
      storyPoints: p.storyPoints,
      dueDate: p.dueDate,
      startDate: p.startDate,
      recurrence: p.recurrence,
      completions: p.completions,
      customFields: p.customFields ?? {},
      rank: p.rank ?? (existing.length + 1) * RANK_STEP,
      createdAt: now,
      updatedAt: now
    }
    await db.items.add(item)
    set({ items: { ...get().items, [item.id]: item } })
    await recordHistory(get, set, item.id, '', item.status)
    return item
  },

  updateItem: async (id, patch) => {
    const cur = get().items[id]
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
    await db.items.put(next)
    set({ items: { ...get().items, [id]: next } })
    if (patch.status && patch.status !== cur.status) {
      await recordHistory(get, set, id, cur.status, patch.status)
      const databaseId = next.databaseId
      if (databaseId) {
        const dbDef = get().databases[databaseId]
        if (dbDef) runAutomations(dbDef.automations, next, patch.status, set)
      }
    }
  },

  deleteItem: async (id) => {
    await db.items.delete(id)
    await db.statusHistory.where({ itemId: id }).delete()
    const items = { ...get().items }
    delete items[id]
    set({ items })
  },

  setItemStatus: async (id, status) => {
    await get().updateItem(id, { status })
  },

  moveItemTo: async (id, databaseId, status) => {
    await get().updateItem(id, { databaseId, status })
  },

  reorderItem: async (id, beforeId, context) => {
    const me = get().items[id]
    if (!me) return
    let rank: number
    if (beforeId === null) {
      rank = (me.rank / 2) || 0.5
    } else {
      const before = get().items[beforeId]
      if (!before) return
      const others = Object.values(get().items).filter(
        (i) => i.databaseId === context.databaseId && i.id !== id
      )
      const smaller = others.filter((i) => i.rank < before.rank).sort((a, b) => b.rank - a.rank)[0]
      rank = smaller ? (smaller.rank + before.rank) / 2 : before.rank / 2
    }
    await get().updateItem(id, { rank })
  },

  toggleHabitCompletion: async (id, dateISO) => {
    const it = get().items[id]
    if (!it) return
    const completions = new Set(it.completions ?? [])
    if (completions.has(dateISO)) completions.delete(dateISO)
    else completions.add(dateISO)
    await get().updateItem(id, { completions: [...completions].sort() })
  },

  upsertSprint: async (s) => {
    await db.sprints.put(s)
    set({ sprints: { ...get().sprints, [s.id]: s } })
  },
  deleteSprint: async (id) => {
    await db.sprints.delete(id)
    const sprints = { ...get().sprints }
    delete sprints[id]
    set({ sprints })
    for (const it of Object.values(get().items)) {
      if (it.sprintId === id) await get().updateItem(it.id, { sprintId: undefined })
    }
  },
  upsertDatabase: async (d) => {
    await db.databases.put(d)
    set({ databases: { ...get().databases, [d.id]: d } })
  },
  deleteDatabase: async (id) => {
    await db.databases.delete(id)
    await db.items.where({ databaseId: id }).delete()
    const databases = { ...get().databases }
    delete databases[id]
    const items: Record<string, WorkspaceItem> = {}
    for (const [k, v] of Object.entries(get().items)) if (v.databaseId !== id) items[k] = v
    set({ databases, items })
  }
}))

async function recordHistory(
  get: () => ItemsState,
  set: (p: Partial<ItemsState>) => void,
  itemId: string,
  from: string,
  to: string
): Promise<void> {
  if (!from) return
  const ev: StatusEvent = { id: uid(), itemId, from, to, at: new Date().toISOString() }
  await db.statusHistory.add(ev)
  set({ statusHistory: [...get().statusHistory, ev] })
}

function runAutomations(
  automations: Automation[],
  item: WorkspaceItem,
  status: string,
  set: (p: Partial<ItemsState>) => void
): void {
  for (const a of automations) {
    if (a.onStatus !== status) continue
    const patch: Partial<WorkspaceItem> = {}
    for (const action of a.actions) {
      switch (action.kind) {
        case 'set-priority':
          patch.priority = action.value
          break
        case 'add-label':
          patch.labels = Array.from(new Set([...item.labels, action.value]))
          break
        case 'set-due-days': {
          const d = new Date()
          d.setDate(d.getDate() + action.value)
          patch.dueDate = d.toISOString().slice(0, 10)
          break
        }
        case 'notify':
          void useNotifyStore
            .getState()
            .push({ kind: 'system', title: 'Automation', body: action.value, link: `items/${item.id}` })
          break
      }
    }
    if (Object.keys(patch).length) void useItemsStore.getState().updateItem(item.id, patch)
    void set // (kept for symmetry; mutations go through the store above)
  }
}

/** One reminder pipeline: due items + overdue items surface in the Notification Center (§7). */
export function scheduleDueDateReminders(state: ItemsState): void {
  const today = todayISO()
  const notify = useNotifyStore.getState()
  for (const item of Object.values(state.items)) {
    if (!item.dueDate) continue
    const database = state.databases[item.databaseId ?? '']
    const done =
      !database || database.statuses.find((s) => s.id === item.status)?.isDone
    if (done) continue
    if (item.dueDate === today) {
      const dup = notify.items.some((n) => n.link === `items/${item.id}`)
      if (!dup) {
        void notify.push({
          kind: 'task-due',
          title: 'Due today',
          body: `${item.title}`,
          link: `items/${item.id}`
        })
      }
    } else if (item.dueDate < today) {
      const dup = notify.items.some((n) => n.link === `items/${item.id}:late`)
      if (!dup) {
        void notify.push({
          kind: 'task-due',
          title: 'Overdue',
          body: `${item.title} was due ${item.dueDate}`,
          link: `items/${item.id}:late`
        })
      }
    }
  }
}
