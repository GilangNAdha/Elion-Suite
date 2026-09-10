import { create } from 'zustand'
import { db } from '../lib/db'
import {
  uid,
  type Block,
  type BlockSuiteState,
  type BlockComment,
  type PageRecord,
  type PageSnapshot,
  type SavedFilter,
  type Template
} from '../lib/types'
import { useNotifyStore } from './notifyStore'

interface PagesState {
  ready: boolean
  pages: Record<string, PageRecord>
  snapshots: PageSnapshot[]
  templates: Record<string, Template>
  comments: Record<string, BlockComment[]>
  savedFilters: SavedFilter[]

  init: () => Promise<void>

  createPage: (p: Partial<PageRecord> & { title: string }) => Promise<PageRecord>
  renamePage: (id: string, title: string) => Promise<void>
  saveNative: (
    id: string,
    native: BlockSuiteState,
    blocks: Block[],
    title: string,
    capturedAt?: string
  ) => Promise<void>
  setEditorMode: (id: string, mode: 'page' | 'edgeless') => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  setIcon: (id: string, icon: string) => Promise<void>
  deletePage: (id: string) => Promise<void>
  movePage: (id: string, parentId: string | null) => Promise<void>
  setBlocks: (pageId: string, blocks: Block[]) => Promise<void>
  updateBlock: (pageId: string, blockId: string, patch: Partial<Block>) => Promise<void>
  snapshotNow: (pageId: string, label: string, auto?: boolean) => Promise<void>
  restoreSnapshot: (pageId: string, snapshotId: string) => Promise<PageSnapshot | null>
  deleteSnapshot: (id: string) => Promise<void>

  saveTemplate: (name: string, kind: Template['kind'], payload: Template['payload']) => Promise<void>
  applyTemplate: (id: string) => Promise<PageRecord | null>
  deleteTemplate: (id: string) => Promise<void>

  addComment: (pageId: string, blockId: string, author: string, text: string) => Promise<void>

  upsertFilter: (f: SavedFilter) => Promise<void>
  deleteFilter: (id: string) => Promise<void>
}

export const usePagesStore = create<PagesState>()((set, get) => ({
  ready: false,
  pages: {},
  snapshots: [],
  templates: {},
  comments: {},
  savedFilters: [],

  init: async () => {
    const [pages, snapshots, templates, comments, filters] = await Promise.all([
      db.pages.toArray(),
      db.snapshots.orderBy('takenAt').reverse().limit(500).toArray(),
      db.templates.toArray(),
      db.comments.orderBy('at').limit(500).toArray(),
      db.savedFilters.toArray()
    ])
    const byPage: Record<string, BlockComment[]> = {}
    for (const c of comments) (byPage[c.pageId] ??= []).unshift(c)
    set({
      ready: true,
      pages: Object.fromEntries(pages.map((p) => [p.id, p])),
      snapshots,
      templates: Object.fromEntries(templates.map((t) => [t.id, t])),
      comments: byPage,
      savedFilters: filters
    })
  },

  createPage: async (p) => {
    const now = new Date().toISOString()
    const rootId = uid()
    const page: PageRecord = {
      id: rootId,
      parentId: p.parentId ?? null,
      title: p.title,
      icon: p.icon ?? 'file-text',
      branch: p.branch ?? 'workspace',
      blocks: p.blocks ?? [
        { id: uid(), type: 'heading1', content: p.title, parentId: null, order: 1, props: {} },
        {
          id: uid(),
          type: 'paragraph',
          content: '',
          parentId: null,
          order: 2,
          props: {}
        }
      ],
      databaseId: p.databaseId ?? null,
      editorMode: p.editorMode ?? 'page',
      favorite: p.favorite ?? false,
      createdAt: now,
      updatedAt: now
    }
    await db.pages.add(page)
    // §61: lapisan yang mengerjakan menulis event, bukan UI
    void import('../lib/activity').then(({ logActivity }) => logActivity('document.created', { detail: page.title }))
    set({ pages: { ...get().pages, [page.id]: page } })
    return page
  },

  saveNative: async (id, native, blocks, title, capturedAt) => {
    const page = get().pages[id]
    if (!page) return
    const patch = { native, blocks, title, updatedAt: capturedAt ?? new Date().toISOString() }
    await db.pages.update(id, patch)
    if (get().pages[id]) set({ pages: { ...get().pages, [id]: { ...get().pages[id], ...patch } } })
  },

  setEditorMode: async (id, editorMode) => {
    const page = get().pages[id]
    if (!page) return
    await db.pages.update(id, { editorMode })
    set({ pages: { ...get().pages, [id]: { ...get().pages[id], editorMode } } })
  },

  toggleFavorite: async (id) => {
    const page = get().pages[id]
    if (!page) return
    const favorite = !page.favorite
    await db.pages.update(id, { favorite })
    set({ pages: { ...get().pages, [id]: { ...get().pages[id], favorite } } })
  },

  renamePage: async (id, title) => {
    const page = get().pages[id]
    if (!page) return
    const patch = {
      title,
      native: page.native ? { ...page.native, projectionDirty: true } : undefined,
      updatedAt: new Date().toISOString()
    }
    await db.pages.update(id, patch)
    set({ pages: { ...get().pages, [id]: { ...get().pages[id], ...patch } } })
  },

  setIcon: async (id, icon) => {
    const page = get().pages[id]
    if (!page) return
    const next = { ...page, icon, updatedAt: new Date().toISOString() }
    await db.pages.put(next)
    set({ pages: { ...get().pages, [id]: next } })
  },

  deletePage: async (id) => {
    const all = Object.values(get().pages)
    const toDelete = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const p of all) {
        if (p.parentId && toDelete.has(p.parentId) && !toDelete.has(p.id)) {
          toDelete.add(p.id)
          grew = true
        }
      }
    }
    await db.pages.bulkDelete([...toDelete])
    for (const pid of toDelete) await db.snapshots.where({ pageId: pid }).delete()
    const pages: Record<string, PageRecord> = {}
    for (const [k, v] of Object.entries(get().pages)) if (!toDelete.has(k)) pages[k] = v
    set({ pages })
  },

  movePage: async (id, parentId) => {
    const page = get().pages[id]
    if (!page) return
    if (parentId === id) return
    // Prevent nesting a page under its own descendant
    let cursor = get().pages[parentId ?? '']
    while (cursor) {
      if (cursor.id === id) return
      cursor = get().pages[cursor.parentId ?? '']
    }
    const next = { ...page, parentId, updatedAt: new Date().toISOString() }
    await db.pages.put(next)
    set({ pages: { ...get().pages, [id]: next } })
  },

  setBlocks: async (pageId, blocks) => {
    const page = get().pages[pageId]
    if (!page) return
    const next = {
      ...page,
      blocks,
      native: page.native ? { ...page.native, projectionDirty: true } : undefined,
      updatedAt: new Date().toISOString()
    }
    await db.pages.put(next)
    set({ pages: { ...get().pages, [pageId]: next } })
  },

  updateBlock: async (pageId, blockId, patch) => {
    const page = get().pages[pageId]
    if (!page) return
    const blocks = page.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b))
    await get().setBlocks(pageId, blocks)
  },

  snapshotNow: async (pageId, label, auto = false) => {
    const page = get().pages[pageId]
    if (!page) return
    const snap: PageSnapshot = {
      id: uid(),
      pageId,
      title: page.title,
      takenAt: new Date().toISOString(),
      label,
      auto,
      blocks: JSON.parse(JSON.stringify(page.blocks)),
      native: page.native ? { ...page.native } : undefined
    }
    await db.snapshots.add(snap)
    set({ snapshots: [snap, ...get().snapshots] })
  },

  restoreSnapshot: async (pageId, snapshotId) => {
    const snap = get().snapshots.find((s) => s.id === snapshotId)
    if (!snap) return null
    const page = get().pages[pageId]
    if (!page || snap.pageId !== pageId) return null
    const next = {
      ...page,
      title: snap.title,
      blocks: JSON.parse(JSON.stringify(snap.blocks)) as Block[],
      native: snap.native ? { ...snap.native } : undefined,
      updatedAt: new Date().toISOString()
    }
    await db.pages.put(next)
    set({ pages: { ...get().pages, [pageId]: next } })
    return snap
  },

  deleteSnapshot: async (id) => {
    await db.snapshots.delete(id)
    set({ snapshots: get().snapshots.filter((s) => s.id !== id) })
  },

  saveTemplate: async (name, kind, payload) => {
    const t: Template = { id: uid(), name, kind, payload, createdAt: new Date().toISOString() }
    await db.templates.add(t)
    set({ templates: { ...get().templates, [t.id]: t } })
  },

  applyTemplate: async (id) => {
    const t = get().templates[id]
    if (!t) return null
    if (t.kind === 'page') {
      const raw = JSON.parse(JSON.stringify(t.payload.blocks ?? [])) as Block[]
      // Every block gets a fresh id — and every REFERENCE to a template block
      // (parentId, column ids, edge endpoints) is rewritten to the new id, so
      // nested structures (columns, frames, edges) survive intact.
      const remap = new Map<string, string>()
      for (const b of raw) if (!remap.has(b.id)) remap.set(b.id, uid())
      const blocks = raw.map((b) => {
        const next: Block = { ...b, id: remap.get(b.id)! }
        next.parentId = b.parentId ? (remap.get(b.parentId) ?? b.parentId) : null
        const props: Record<string, unknown> = { ...b.props }
        if (Array.isArray(props.cols)) {
          props.cols = (props.cols as string[][]).map((col) => col.map((x) => remap.get(x) ?? x))
        }
        if (b.type === 'edge') {
          const f = String(props.from ?? '')
          const to = String(props.to ?? '')
          props.from = remap.get(f) ?? f
          props.to = remap.get(to) ?? to
        }
        next.props = props
        return next
      })
      return get().createPage({
        title: t.payload.title ?? t.name,
        blocks: blocks.length ? blocks : undefined
      })
    }
    return null
  },

  deleteTemplate: async (id) => {
    await db.templates.delete(id)
    const templates = { ...get().templates }
    delete templates[id]
    set({ templates })
  },

  addComment: async (pageId, blockId, author, text) => {
    const mentions = Array.from(text.matchAll(/@([\w-]+)/g)).map((m) => m[1])
    const c: BlockComment = {
      id: uid(),
      pageId,
      blockId,
      author,
      text,
      mentions,
      at: new Date().toISOString()
    }
    await db.comments.add(c)
    const list = [...(get().comments[pageId] ?? []), c]
    set({ comments: { ...get().comments, [pageId]: list } })
    for (const m of mentions) {
      void useNotifyStore.getState().push({
        kind: 'mention',
        title: `${author} mentioned @${m}`,
        body: text.slice(0, 80),
        link: `pages/${pageId}`
      })
    }
  },

  upsertFilter: async (f) => {
    await db.savedFilters.put(f)
    set({ savedFilters: [...get().savedFilters.filter((x) => x.id !== f.id), f] })
  },

  deleteFilter: async (id) => {
    await db.savedFilters.delete(id)
    set({ savedFilters: get().savedFilters.filter((f) => f.id !== id) })
  }
}))
