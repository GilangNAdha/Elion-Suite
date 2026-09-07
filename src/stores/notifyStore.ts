import { create } from 'zustand'
import { db } from '../lib/db'
import { uid, type NotificationKind, type NotificationRecord } from '../lib/types'
import { playChime } from '../lib/audio'

interface NotifyState {
  items: NotificationRecord[]
  ready: boolean
  init: () => Promise<void>
  push: (n: { kind: NotificationKind; title: string; body: string; link?: string }) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

export const useNotifyStore = create<NotifyState>()((set, get) => ({
  items: [],
  ready: false,
  init: async () => {
    const rows = await db.notifications.orderBy('at').reverse().limit(100).toArray()
    set({ items: rows, ready: true })
  },
  push: async (n) => {
    const rec: NotificationRecord = {
      id: uid(),
      kind: n.kind,
      title: n.title,
      body: n.body,
      at: new Date().toISOString(),
      read: false,
      link: n.link
    }
    await db.notifications.add(rec)
    set({ items: [rec, ...get().items].slice(0, 100) })
    // System notification surface (graceful no-op without permission)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(rec.title, { body: rec.body })
      }
    } catch {
      /* non-secure context — ignore */
    }
    if (n.kind === 'alarm' || n.kind === 'task-due') playChime('reminder')
  },
  markRead: async (id) => {
    await db.notifications.update(id, { read: true })
    set({ items: get().items.map((x) => (x.id === id ? { ...x, read: true } : x)) })
  },
  markAllRead: async () => {
    await db.notifications.where({ read: false }).modify({ read: true })
    set({ items: get().items.map((x) => ({ ...x, read: true })) })
  },
  remove: async (id) => {
    await db.notifications.delete(id)
    set({ items: get().items.filter((x) => x.id !== id) })
  },
  clear: async () => {
    await db.notifications.where({ read: true }).delete()
    set({ items: get().items.filter((x) => !x.read) })
  }
}))
