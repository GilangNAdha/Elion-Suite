import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Block, BlockType, PageRecord } from '../../lib/types'
import { uid } from '../../lib/types'
import {
  convertBlock,
  deleteBlocks,
  insertBlock,
  layoutColumns,
  makeBlock,
  moveBlocks,
  BLOCK_LABEL
} from '../../lib/blockEngine'
import { usePagesStore } from '../../stores/pagesStore'
import { useToasts } from '../ui'

const HISTORY_CAP = 120

export interface HistoryEntry {
  label: string
  blocks: Block[]
}

export interface EditorSession {
  page: PageRecord
  blocks: Block[]
  focusContent: React.MutableRefObject<Map<string, string>>
  history: HistoryEntry[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  jumpTo: (i: number) => void

  selection: string[]
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void

  focusRequest: { id: string; key: number } | null
  requestFocus: (id: string) => void

  commit: (label: string, fn: (blocks: Block[]) => Block[]) => void
  insertNew: (type: BlockType, beforeId?: string | null, parentId?: string | null) => string
  convert: (id: string, to: BlockType) => void
  remove: (ids: string[]) => void
  duplicate: (ids: string[]) => void
  move: (ids: string[], beforeId: string | null, parentId: string | null) => void
  composeColumns: (dragged: string[], targetId: string, side: 'left' | 'right') => void
  setBlockContent: (id: string, content: string) => void
  commitTextEdit: (id: string) => void
  patchBlock: (id: string, patch: Partial<Block>) => void
  takeSnapshot: (label: string, auto?: boolean) => void
  restoreSnapshot: (snapshotId: string) => void
  createDatabaseBlock: (beforeId?: string | null) => void
}

export function useEditorSession(page: PageRecord): EditorSession {
  const setBlocksPersist = usePagesStore((s) => s.setBlocks)
  const snapshotNow = usePagesStore((s) => s.snapshotNow)
  const restoreSnapshotStore = usePagesStore((s) => s.restoreSnapshot)
  const pushToast = useToasts((s) => s.push)

  const [blocks, setBlocks] = useState<Block[]>(() => JSON.parse(JSON.stringify(page.blocks)))
  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    { label: 'Opened page', blocks: JSON.parse(JSON.stringify(page.blocks)) }
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [selection, setSelection] = useState<string[]>([])
  const [focusRequest, setFocusRequest] = useState<{ id: string; key: number } | null>(null)

  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const focusContentRef = useRef<Map<string, string>>(new Map())
  const persistTimer = useRef<number | null>(null)

  const schedulePersist = useCallback(
    (next: Block[]) => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current)
      persistTimer.current = window.setTimeout(() => {
        void setBlocksPersist(page.id, next)
      }, 350)
    },
    [page.id, setBlocksPersist]
  )

  const commit = useCallback(
    (label: string, fn: (b: Block[]) => Block[]) => {
      const cur = blocksRef.current
      const next = fn(cur)
      if (next === cur) return
      setHistory((h) => {
        const trimmed = h.slice(0, historyIndexRef.current + 1)
        const entry: HistoryEntry = { label, blocks: JSON.parse(JSON.stringify(next)) }
        const arr = [...trimmed, entry]
        if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP)
        setHistoryIndex(arr.length - 1)
        return arr
      })
      setBlocks(next)
      schedulePersist(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedulePersist]
  )

  const historyIndexRef = useRef(historyIndex)
  historyIndexRef.current = historyIndex

  const jumpTo = useCallback(
    (i: number) => {
      setHistory((h) => {
        const clamped = Math.max(0, Math.min(h.length - 1, i))
        setHistoryIndex(clamped)
        return h
      })
      // apply after state settles
      requestAnimationFrame(() => {
        const entry = historyRef.current[historyIndexRef.current]
        if (entry) {
          const next = JSON.parse(JSON.stringify(entry.blocks)) as Block[]
          setBlocks(next)
          schedulePersist(next)
        }
      })
    },
    [schedulePersist]
  )
  const historyRef = useRef(history)
  historyRef.current = history

  const requestFocus = useCallback((id: string) => {
    setFocusRequest({ id, key: Date.now() })
  }, [])

  const insertNew = useCallback(
    (type: BlockType, beforeId: string | null = null, parentId: string | null = null): string => {
      const b = makeBlock(type, { parentId })
      let createdId = b.id
      commit(`Added ${BLOCK_LABEL[type].toLowerCase()}`, (cur) => {
        const res = insertBlock(cur, b, beforeId, parentId)
        createdId = res.blocks[res.blocks.length - 1].id
        return res.blocks
      })
      if (type !== 'divider' && type !== 'database') requestFocus(createdId)
      return createdId
    },
    [commit, requestFocus]
  )

  const convert = useCallback(
    (id: string, to: BlockType) => {
      const target = blocksRef.current.find((b) => b.id === id)
      if (!target) return
      commit(`Converted ${BLOCK_LABEL[target.type].toLowerCase()} to ${BLOCK_LABEL[to].toLowerCase()}`, (cur) =>
        cur.map((b) => (b.id === id ? convertBlock(b, to, cur) : b))
      )
      requestFocus(id)
    },
    [commit, requestFocus]
  )

  const remove = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      commit(
        ids.length > 1 ? `Deleted ${ids.length} blocks` : 'Deleted block',
        (cur) => deleteBlocks(cur, ids).blocks
      )
      setSelection([])
    },
    [commit]
  )

  /** Duplicate blocks (with descendants) directly below the originals,
   *  remapping children, columns and edge endpoints to the new ids. */
  const duplicate = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      const cur = blocksRef.current
      const idSet = new Set(ids)
      // top-level originals: not a descendant of another selected block
      const tops = ids.filter((id) => {
        const b = cur.find((x) => x.id === id)
        return !!b && !(b.parentId && idSet.has(b.parentId))
      })
      if (tops.length === 0) return
      // old id → new id for the originals and all their descendants
      const map = new Map<string, string>()
      const queue = [...tops]
      while (queue.length) {
        const id = queue.pop()!
        if (map.has(id)) continue
        map.set(id, uid())
        for (const b of cur) if (b.parentId === id) queue.push(b.id)
      }
      commit(`Duplicated ${tops.length} block${tops.length > 1 ? 's' : ''}`, (blocks) => {
        const remapId = (v: string) => map.get(v) ?? v
        const copies = blocks
          .filter((b) => map.has(b.id))
          .map((b) => {
            const props: Record<string, unknown> = { ...b.props }
            if (Array.isArray(props.cols)) {
              props.cols = (props.cols as string[][]).map((col) => col.map(remapId))
            }
            return {
              ...b,
              id: map.get(b.id)!,
              parentId: b.parentId && map.has(b.parentId) ? map.get(b.parentId)! : b.parentId,
              props
            }
          })
        // place each top-level copy just below its original
        const withOrder = copies.map((c) => {
          if (c.parentId && map.has(c.parentId)) return c
          const original = blocks.find((b) => b.id === [...map.entries()].find(([, n]) => n === c.id)?.[0])
          const sibs = blocks.filter((b) => b.parentId === c.parentId).sort((a, b) => a.order - b.order)
          const oi = sibs.findIndex((b) => b.id === original?.id)
          const after = sibs.slice(oi + 1).find((b) => !map.has(b.id))
          return { ...c, order: after ? (sibs[oi].order + after.order) / 2 : sibs[oi].order + 1000 }
        })
        // copies of edges point at the remapped endpoints
        const fixed = withOrder.map((c) =>
          c.type === 'edge'
            ? { ...c, props: { ...c.props, from: remapId(String(c.props.from ?? '')), to: remapId(String(c.props.to ?? '')) } }
            : c
        )
        return [...blocks, ...fixed]
      })
    },
    [commit, blocksRef]
  )

  const move = useCallback(
    (ids: string[], beforeId: string | null, parentId: string | null) => {
      if (ids.length === 0) return
      commit(
        ids.length > 1 ? `Moved ${ids.length} blocks` : 'Moved block',
        (cur) => moveBlocks(cur, ids, beforeId, parentId).blocks
      )
    },
    [commit]
  )

  const composeColumns = useCallback(
    (dragged: string[], targetId: string, side: 'left' | 'right') => {
      commit('Created two-column layout', (cur) => layoutColumns(cur, dragged, targetId, side).blocks)
    },
    [commit]
  )

  const setBlockContent = useCallback((id: string, content: string) => {
    // live text — no history entry per keystroke
    setBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, content } : b)))
    schedulePersist(blocksRef.current)
  }, [schedulePersist])

  const commitTextEdit = useCallback(
    (id: string) => {
      const started = focusContentRef.current.get(id)
      const cur = blocksRef.current.find((b) => b.id === id)
      if (!cur || started === undefined) return
      if (started !== cur.content) {
        commit(`Edited ${BLOCK_LABEL[cur.type].toLowerCase()} text`, (b) => b)
      }
      focusContentRef.current.delete(id)
    },
    [commit]
  )

  const patchBlock = useCallback(
    (id: string, patch: Partial<Block>) => {
      commit('Updated block properties', (cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    },
    [commit]
  )

  const takeSnapshot = useCallback(
    (label: string, auto = false) => {
      void snapshotNow(page.id, label || (auto ? 'Auto snapshot' : 'Manual snapshot'), auto)
      if (!auto) pushToast('Version snapshot saved', 'success')
    },
    [page.id, snapshotNow, pushToast]
  )

  const restoreSnapshot = useCallback(
    (snapshotId: string) => {
      void restoreSnapshotStore(page.id, snapshotId).then((snap) => {
        if (!snap) return
        setBlocks(JSON.parse(JSON.stringify(snap.blocks)))
        setHistory((h) => {
          const entry: HistoryEntry = {
            label: `Restored snapshot “${snap.label}”`,
            blocks: JSON.parse(JSON.stringify(snap.blocks))
          }
          const arr = [...h.slice(0, historyIndexRef.current + 1), entry]
          if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP)
          setHistoryIndex(arr.length - 1)
          return arr
        })
        pushToast(`Restored “${snap.label}”`, 'success')
      })
    },
    [page.id, restoreSnapshotStore, pushToast]
  )

  const createDatabaseBlock = useCallback(
    (beforeId: string | null = null) => {
      const dbId = uid()
      commit('Added database block', (cur) => {
        const b = makeBlock('database', { props: { dbId } })
        return insertBlock(cur, b, beforeId, null).blocks
      })
      // create the database record + host page linkage
      const dbStore = {
        id: dbId,
        pageId: page.id,
        name: 'New database',
        properties: [],
        statuses: [
          { id: 'backlog', name: 'Backlog', color: 'var(--ink-faint)', isBacklog: true },
          { id: 'todo', name: 'To do', color: 'var(--info)' },
          { id: 'doing', name: 'In progress', color: 'var(--warn)' },
          { id: 'done', name: 'Done', color: 'var(--ok)', isDone: true }
        ],
        views: [
          { id: uid(), name: 'Board', kind: 'board', visibleProperties: ['title', 'status', 'priority'], swimlane: 'none' },
          { id: uid(), name: 'Table', kind: 'table', visibleProperties: ['title', 'status', 'priority', 'dueDate'] }
        ],
        automations: [],
        defaultType: 'task'
      }
      void usePagesStore
        .getState()
        .setBlocks(page.id, blocksRef.current)
        .then(() =>
          import('../../stores/itemsStore').then((m) =>
            m.useItemsStore.getState().upsertDatabase(dbStore as never).then(() => {
              usePagesStore
                .getState()
                .setBlocks(page.id, blocksRef.current)
            })
          )
        )
    },
    [commit, page.id]
  )

  const undo = useCallback(() => jumpTo(historyIndexRef.current - 1), [jumpTo])
  const redo = useCallback(() => jumpTo(historyIndexRef.current + 1), [jumpTo])

  // Auto snapshot ~5 min after first edit, then hourly (local Time Machine)
  useEffect(() => {
    const t = setTimeout(() => takeSnapshot('Auto snapshot', true), 5 * 60 * 1000)
    return () => clearTimeout(t)
  }, [takeSnapshot])

  return useMemo(
    () => ({
      page,
      blocks,
      focusContent: focusContentRef,
      history,
      historyIndex,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      undo,
      redo,
      jumpTo,
      selection,
      setSelection,
      toggleSelection: (id) =>
        setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
      clearSelection: () => setSelection([]),
      focusRequest,
      requestFocus,
      commit,
      insertNew,
      convert,
      remove,
      duplicate,
      move,
      composeColumns,
      setBlockContent,
      commitTextEdit,
      patchBlock,
      takeSnapshot,
      restoreSnapshot,
      createDatabaseBlock
    }),
    [
      page, blocks, history, historyIndex, undo, redo, jumpTo, selection,
      focusRequest, requestFocus, commit, insertNew, convert, remove, duplicate, move,
      composeColumns, setBlockContent, commitTextEdit, patchBlock, takeSnapshot,
      restoreSnapshot, createDatabaseBlock
    ]
  )
}
