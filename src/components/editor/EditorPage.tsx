import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragStartEvent, DragMoveEvent, DragEndEvent } from '@dnd-kit/core'
import {
  ArrowLeft, Undo2, Redo2, PanelLeft, PanelRight, History, Camera,
  Command, MousePointer2, X, AlignLeft, AlignCenter, AlignRight, Eraser
} from 'lucide-react'
import type { Block, BlockType } from '../../lib/types'
import { computeDropIntent, makeBlock, topLevelBlocks, childrenOf, BLOCK_LABEL, TEXT_BLOCK_TYPES } from '../../lib/blockEngine'
import type { DropIntent } from '../../lib/blockEngine'
import { useEditorSession } from './useEditorSession'
import { BlockView, BlockToolbar, BLOCK_ICON, nullAfter } from './blocks'
import { LeftPanel, RightPanel, HistoryDrawer, SnapshotsDrawer, CommentsDrawer } from './panels'
import { EdgelessCanvas } from './EdgelessCanvas'
import { Button, IconBtn, Kbd, Tabs, EmptyState } from '../ui'
import { CommandPalette, usePaletteActions } from '../shell/CommandPalette'
import { usePagesStore } from '../../stores/pagesStore'
import type { EdgelessApi } from './EdgelessCanvas'

type OverlayKind = null | 'history' | 'snapshots' | 'comments'
type DragInfo =
  | { kind: 'chip'; blockType: BlockType }
  | { kind: 'block'; blockIds: string[] }

interface LayoutPref {
  leftOpen: boolean
  leftTab: 'outline' | 'library'
  leftW: number
  rightOpen: boolean
  rightW: number
  mode: 'page' | 'edgeless'
}

const DEFAULT_LAYOUT: LayoutPref = {
  leftOpen: true,
  leftTab: 'library',
  leftW: 256,
  rightOpen: false,
  rightW: 272,
  mode: 'page'
}

function loadLayout(): LayoutPref {
  try {
    const raw = localStorage.getItem('elion-editor-layout')
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT
}

export function EditorPage() {
  const { pageId = '' } = useParams()
  const page = usePagesStore((s) => s.pages[pageId])
  if (!page) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-ink">
        <EmptyState title="Page not found" hint="It may have been deleted." />
      </div>
    )
  }
  return <EditorChrome key={page.id} pageId={page.id} />
}

function EditorChrome({ pageId }: { pageId: string }) {
  const navigate = useNavigate()
  const page = usePagesStore((s) => s.pages[pageId])!
  const session = useEditorSession(page)
  const pushToast = (t: string, tone?: 'info' | 'success' | 'error') =>
    import('../ui').then(({ useToasts }) => useToasts.getState().push(t, tone ?? 'info'))

  const [layout, setLayout] = useState<LayoutPref>(loadLayout)
  const [overlay, setOverlay] = useState<OverlayKind>(null)
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [tbVisible, setTbVisible] = useState(true)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null)
  const [intent, setIntent] = useState<DropIntent | null>(null)
  const [intentRects, setIntentRects] = useState<Record<string, { top: number; left: number; width: number; height: number }>>({})

  const canvasRef = useRef<HTMLDivElement>(null)
  const tbTimer = useRef<number | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const edgelessApi = useRef<EdgelessApi>({ dragKind: null, onMove: () => undefined, onEnd: () => undefined })

  const patchLayout = (p: Partial<LayoutPref>) => {
    setLayout((l) => {
      const next = { ...l, ...p }
      localStorage.setItem('elion-editor-layout', JSON.stringify(next))
      return next
    })
  }

  // ---- toolbar auto-hide (mouse-to-top or shortcut reveals it) ----
  const pokeToolbar = useCallback(() => {
    setTbVisible(true)
    if (tbTimer.current) window.clearTimeout(tbTimer.current)
    tbTimer.current = window.setTimeout(() => {
      const el = document.activeElement
      const editing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      if (!editing) setTbVisible(false)
    }, 2200)
  }, [])

  // ---- block rect measurement (viewport coords) ----
  const measureRects = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return {}
    const canvasRect = canvas.getBoundingClientRect()
    const out: Record<string, { top: number; left: number; width: number; height: number }> = {}
    canvas.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
      const r = el.getBoundingClientRect()
      const id = el.dataset.block!
      out[id] = {
        top: r.top - canvasRect.top + canvas.scrollTop,
        left: r.left - canvasRect.left + canvas.scrollLeft,
        width: r.width,
        height: r.height
      }
    })
    return out
  }, [])

  // ---- DnD ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { kind: string; blockType?: BlockType; blockIds?: string[] }
    if (data.kind === 'chip' && data.blockType) {
      setDragInfo({ kind: 'chip', blockType: data.blockType })
      edgelessApi.current.dragKind = 'chip'
      edgelessApi.current.dragType = data.blockType
    } else if (data.kind === 'block' && data.blockIds) {
      setDragInfo({ kind: 'block', blockIds: data.blockIds })
      edgelessApi.current.dragKind = 'block'
      edgelessApi.current.dragIds = data.blockIds
    } else {
      edgelessApi.current.dragKind = null
    }
    setIntentRects(measureRects())
    pokeToolbar()
  }

  const pointerOf = (e: DragMoveEvent) => {
    const rect = e.active.rect.current.translated
    if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    return { x: e.delta.x, y: e.delta.y }
  }

  const onDragMove = (e: DragMoveEvent) => {
    const p = pointerOf(e)
    if (layout.mode === 'edgeless') {
      edgelessApi.current.onMove(p)
      return
    }
    const canvas = canvasRef.current
    if (!canvas || !dragInfo) return
    const canvasRect = canvas.getBoundingClientRect()
    if (p.x < canvasRect.left || p.x > canvasRect.right || p.y < canvasRect.top || p.y > canvasRect.bottom) {
      setIntent(null)
      return
    }
    const rects = Object.fromEntries(
      Object.entries(intentRects).filter(([id]) => !('blockIds' in dragInfo && dragInfo.blockIds.includes(id)))
    )
    // rects are measured in CONTENT coordinates (scroll included) — the
    // pointer must be offset the same way or drop intent drifts while scrolled
    setIntent(
      computeDropIntent(rects, {
        x: p.x - canvasRect.left + canvas.scrollLeft,
        y: p.y - canvasRect.top + canvas.scrollTop
      })
    )
  }

  const onDragEnd = (e: DragEndEvent) => {
    const info = dragInfo
    const it = intent
    setDragInfo(null)
    setIntent(null)
    if (layout.mode === 'edgeless') {
      const p = pointerOf(e)
      edgelessApi.current.onEnd(p)
      return
    }
    if (!info || !it || it.kind === 'none') return
    const targetId =
      it.kind === 'append' ? null : 'blockId' in it ? (it.blockId ?? null) : null

    if (info.kind === 'chip') {
      const t = info.blockType
      if (t === 'database') {
        // a database chip creates the database record too — never a bare block
        session.createDatabaseBlock(targetId)
        return
      }
      if (it.kind === 'replace' && targetId) {
        session.convert(targetId, t)
        pushToast(`Converted block to ${BLOCK_LABEL[t]}`)
      } else if (it.kind === 'insert-before' && targetId) {
        session.insertNew(t, targetId)
      } else if (it.kind === 'insert-after' && targetId) {
        // insertNew takes a "before" anchor — resolve the target's next sibling
        const blk = session.blocks.find((b) => b.id === targetId)
        session.insertNew(t, blk ? nullAfter(blk, session) : null)
      } else if (it.kind === 'layout-left' || it.kind === 'layout-right') {
        session.insertNew(t, targetId)
      } else {
        session.insertNew(t, null)
      }
      return
    }

    // moving existing block(s)
    const ids = info.blockIds
    if (it.kind === 'insert-before' && targetId) session.move(ids, targetId, null)
    else if (it.kind === 'insert-after' && targetId) {
      const blk = session.blocks.find((b) => b.id === targetId)
      session.move(ids, blk ? nullAfter(blk, session) : null, null)
    } else if (it.kind === 'replace' && targetId) session.move(ids, targetId, null)
    else if (it.kind === 'layout-left' && targetId) session.composeColumns(ids, targetId, 'left')
    else if (it.kind === 'layout-right' && targetId) session.composeColumns(ids, targetId, 'right')
    else if (it.kind === 'append') {
      session.move(ids, null, null)
    }
  }

  // ---- marquee multi-select (page mode) ----
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (e.button !== 0) return
    if (target.closest('[data-block]') || target.closest('button, input, a, [contenteditable="true"]')) return
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    marqueeStart.current = { x: e.clientX - r.left + canvas.scrollLeft, y: e.clientY - r.top + canvas.scrollTop }
    const added = new Set<string>()
    const onMove = (ev: PointerEvent) => {
      const c = canvasRef.current
      if (!c || !marqueeStart.current) return
      const cr = c.getBoundingClientRect()
      const x = ev.clientX - cr.left + c.scrollLeft
      const y = ev.clientY - cr.top + c.scrollTop
      setMarquee({ x1: marqueeStart.current.x, y1: marqueeStart.current.y, x2: x, y2: y })
      // live selection
      const rects = measureRects()
      const minX = Math.min(marqueeStart.current.x, x)
      const maxX = Math.max(marqueeStart.current.x, x)
      const minY = Math.min(marqueeStart.current.y, y)
      const maxY = Math.max(marqueeStart.current.y, y)
      const hit = Object.entries(rects)
        .filter(([id, r2]) =>
          !added.has(id) &&
          r2.left < maxX && r2.left + r2.width > minX && r2.top < maxY && r2.top + r2.height > minY
        )
        .map(([id]) => id)
      if (hit.length) {
        for (const id of hit) added.add(id)
        session.setSelection([...added])
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setTimeout(() => setMarquee(null), 0)
      marqueeStart.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    session.clearSelection()
  }

  const onBlockClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) session.toggleSelection(id)
    else if (!session.selection.includes(id)) session.setSelection([id])
  }

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const editing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      const isCE = !!(el && (el as HTMLElement).isContentEditable)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        // inside a block being edited, Ctrl+Z must undo TEXT (native), not the
        // block history
        if (isCE) return
        e.preventDefault()
        session.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (isCE) return
        e.preventDefault()
        session.redo()
      } else if (e.key === 'Escape') {
        if (isCE) {
          ;(el as HTMLElement).blur()
          return
        }
        if (session.selection.length) session.clearSelection()
        else if (overlay) setOverlay(null)
      } else if (!editing && (e.key === 'Delete' || e.key === 'Backspace') && session.selection.length) {
        e.preventDefault()
        session.remove(session.selection)
      } else if (!editing && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && session.selection.length) {
        e.preventDefault()
        const ids = session.selection
        const first = session.blocks.find((b) => b.id === ids[0])
        if (!first) return
        const sibs = childrenOf(session.blocks, first.parentId)
        if (e.key === 'ArrowUp') {
          const i = sibs.findIndex((b) => b.id === first.id)
          const prev = i > 0 ? sibs[i - 1] : undefined
          if (prev && !ids.includes(prev.id)) session.move(ids, prev.id, first.parentId)
        } else {
          const i = sibs.findIndex((b) => b.id === ids[ids.length - 1])
          const next = i >= 0 && i < sibs.length - 1 ? sibs[i + 1] : undefined
          if (next && !ids.includes(next.id)) session.move(ids, next.id, first.parentId)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [session, overlay])

  const tops = useMemo(() => topLevelBlocks(session.blocks), [session.blocks])
  const paletteActions = usePaletteActions({
    insertBlock: (type) => session.insertNew(type as BlockType, session.selection[0] ?? null),
    snapshotNow: () => session.takeSnapshot('Manual snapshot')
  })

  const selectedOne = session.selection.length === 1 ? session.blocks.find((b) => b.id === session.selection[0]) : undefined

  // §15.3 transform bar — measure the selected block for the floating bar
  // (re-measured on selection change AND on canvas scroll)
  const [selRect, setSelRect] = useState<{ top: number; left: number; width: number } | null>(null)
  useEffect(() => {
    if (!selectedOne || layout.mode !== 'page') {
      setSelRect(null)
      return
    }
    const canvas = canvasRef.current
    const measure = () => {
      const c = canvasRef.current
      if (!c) return
      const el = c.querySelector<HTMLElement>(`[data-block="${selectedOne.id}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      setSelRect({ top: r.top - cr.top + c.scrollTop, left: r.left - cr.left + c.scrollLeft, width: r.width })
    }
    measure()
    const c = canvasRef.current
    c?.addEventListener('scroll', measure, { passive: true })
    return () => c?.removeEventListener('scroll', measure)
    // keyed by the selected block id — the `selectedOne` object has a new
    // identity every render and must not re-arm the listener each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.blocks, layout.mode, selectedOne?.id])

  // ---- page-mode tree render (columns blocks render their own children) ----
  const renderBlocks = (parentId: string | null): ReactNode =>
    session.blocks
      .filter((b) => b.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((b) => (
        <BlockView
          key={b.id}
          block={b}
          session={session}
          selected={session.selection.includes(b.id)}
          dimmed={dragInfo?.kind === 'block' ? dragInfo.blockIds.includes(b.id) : false}
        />
      ))

  // ---- drop intent indicator (content coords; canvas is the scroll context) ----
  const renderIntentIndicator = () => {
    if (!intent || layout.mode !== 'page') return null
    if (intent.kind === 'append') {
      const last = tops[tops.length - 1]
      const r = last ? intentRects[last.id] : undefined
      return (
        <div
          className="pointer-events-none absolute inset-x-8 z-20 h-1 rounded-full bg-primary/70"
          style={{ top: r ? r.top + r.height + 10 : 84 }}
          aria-hidden
        />
      )
    }
    if (!('blockId' in intent) || !intent.blockId) return null
    const r = intentRects[intent.blockId]
    if (!r) return null
    if (intent.kind === 'replace')
      return (
        <div
          className="pointer-events-none absolute z-20 rounded-token-md border-2 border-primary/70 bg-primary/5"
          style={{ top: r.top - 3, left: r.left - 3, width: r.width + 6, height: r.height + 6 }}
          aria-hidden
        />
      )
    if (intent.kind === 'insert-before')
      return (
        <div
          className="pointer-events-none absolute z-20 h-1 rounded-full bg-primary/80"
          style={{ top: r.top - 5, left: r.left, width: r.width }}
          aria-hidden
        />
      )
    if (intent.kind === 'insert-after')
      return (
        <div
          className="pointer-events-none absolute z-20 h-1 rounded-full bg-primary/80"
          style={{ top: r.top + r.height + 3, left: r.left, width: r.width }}
          aria-hidden
        />
      )
    const onLeft = intent.kind === 'layout-left'
    return (
      <div
        className="pointer-events-none absolute z-20 flex items-center justify-center rounded-token-md border-2 border-dashed border-primary/60 bg-primary/5 text-primary"
        style={{ top: r.top - 8, left: onLeft ? r.left - 56 : r.left + r.width + 8, width: 48, height: r.height + 16 }}
        aria-hidden
      >
        <span className="text-[0.7em] font-semibold">{onLeft ? 'left' : 'right'}</span>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full overflow-hidden bg-bg text-ink"
      onMouseMove={(e) => {
        if (e.clientY < 48) pokeToolbar()
      }}
    >
      {/* ------- auto-hiding top toolbar ------- */}
      <div
        className={`absolute inset-x-0 top-0 z-40 transition-transform duration-200 ${tbVisible ? 'translate-y-0' : '-translate-y-full'}`}
        role="toolbar"
        aria-label="Editor toolbar"
        onMouseEnter={pokeToolbar}
      >
        <div className="glass-panel flex h-12 items-center gap-1.5 border-b border-line px-2" style={{ elevation: 'overlay' } as never}>
          <IconBtn label="Back to app" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </IconBtn>
          <input
            aria-label="Page title"
            className="focus-ring w-48 truncate rounded-token-sm bg-transparent px-2 py-1 text-[1em] font-semibold outline-none hover:bg-surface/60"
            defaultValue={page.title}
            key={page.id}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== page.title)
                void usePagesStore.getState().renamePage(page.id, e.target.value)
            }}
          />
          <span className="text-[0.75em] text-ink-faint">
            {layout.mode === 'page' ? 'Page mode' : 'Edgeless mode'}
          </span>
          <div className="flex-1" />
          <Tabs
            size="sm"
            tabs={[
              { id: 'page', label: 'Page' },
              { id: 'edgeless', label: 'Edgeless' }
            ]}
            value={layout.mode}
            onChange={(m) => patchLayout({ mode: m })}
          />
          <span className="mx-1 h-5 w-px bg-line" />
          <IconBtn label="Undo (Ctrl+Z)" onClick={session.undo} disabled={!session.canUndo}>
            <Undo2 size={16} />
          </IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={session.redo} disabled={!session.canRedo}>
            <Redo2 size={16} />
          </IconBtn>
          <IconBtn label="History" active={overlay === 'history'} onClick={() => setOverlay(overlay === 'history' ? null : 'history')}>
            <History size={16} />
          </IconBtn>
          <IconBtn label="Version snapshots (Time Machine)" onClick={() => setOverlay(overlay === 'snapshots' ? null : 'snapshots')}>
            <Camera size={16} />
          </IconBtn>
          <IconBtn label="Command palette (Ctrl+K)" onClick={() => setPaletteOpen(true)}>
            <Command size={16} />
          </IconBtn>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconBtn label="Toggle left panel" active={layout.leftOpen} onClick={() => patchLayout({ leftOpen: !layout.leftOpen })}>
            <PanelLeft size={16} />
          </IconBtn>
          <IconBtn label="Toggle inspector" active={layout.rightOpen} onClick={() => patchLayout({ rightOpen: !layout.rightOpen })}>
            <PanelRight size={16} />
          </IconBtn>
          <Button variant="primary" size="sm" onClick={() => navigate(-1)}>
            Done
          </Button>
        </div>
        {/* reveal strip */}
        {!tbVisible && (
          <div
            className="absolute inset-x-0 top-0 h-3 cursor-pointer"
            aria-hidden
            onMouseEnter={pokeToolbar}
          />
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragInfo(null)
          setIntent(null)
        }}
      >
        <div className="flex h-full min-h-0 flex-1">
          {/* ------- left panel: outline + block library ------- */}
          {layout.leftOpen && layout.mode === 'page' && (
            <LeftPanel
              page={page}
              tab={layout.leftTab}
              onTab={(t) => patchLayout({ leftTab: t })}
              width={layout.leftW}
              onResize={(w) => patchLayout({ leftW: w })}
              onInsertBlock={(t) =>
                t === 'database'
                  ? session.createDatabaseBlock(session.selection[0] ?? null)
                  : session.insertNew(t, session.selection[0] ?? null)
              }
            />
          )}

          {/* ------- main canvas ------- */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {layout.mode === 'page' ? (
              <div ref={canvasRef} onPointerDown={onCanvasPointerDown} className="relative h-full overflow-auto">
                <div className="mx-auto max-w-3xl px-10 pb-56 pt-16">
                  {tops.length === 0 && (
                    <EmptyState
                      title="Empty page"
                      hint="Type in the first block, or drag one in from the library panel."
                    />
                  )}
                  {renderBlocks(null)}
                </div>
                {renderIntentIndicator()}
              </div>
            ) : (
              <EdgelessCanvas
                session={session}
                api={edgelessApi}
                pokeToolbar={pokeToolbar}
                onOpenComments={(id) => {
                  setCommentsFor(id)
                  setOverlay('comments')
                }}
              />
            )}

            {/* marquee rectangle — content coords inside the scroll container */}
            {marquee && layout.mode === 'page' && (
              <div
                className="pointer-events-none absolute z-30 rounded-token-sm border border-primary bg-primary/10"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1)
                }}
                aria-hidden
              />
            )}

            {/* §15.3 floating transform bar (single text-block selection) */}
            {selectedOne && selRect && TEXT_BLOCK_TYPES.includes(selectedOne.type) && (
              <div
                className="elev-overlay absolute z-40 flex items-center gap-1 rounded-token-full border border-line bg-raised p-1 shadow-lg"
                style={{ top: Math.max(8, selRect.top - 44), left: Math.max(8, selRect.left) }}
                role="toolbar"
                aria-label="Block formatting"
              >
                <select
                  aria-label="Block type"
                  className="focus-ring h-7 max-w-36 rounded-token-sm border border-line bg-surface px-1.5 text-[0.8em]"
                  value={selectedOne.type}
                  onChange={(e) => session.convert(selectedOne.id, e.target.value as BlockType)}
                >
                  {TEXT_BLOCK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BLOCK_LABEL[t]}
                    </option>
                  ))}
                </select>
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    className={`focus-ring flex h-7 w-7 items-center justify-center rounded-token-sm ${
                      String(selectedOne.props.align ?? 'left') === a ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface hover:text-ink'
                    }`}
                    aria-label={`Align ${a}`}
                    aria-pressed={String(selectedOne.props.align ?? 'left') === a}
                    onClick={() => session.patchBlock(selectedOne.id, { props: { ...selectedOne.props, align: a } })}
                  >
                    {a === 'left' ? <AlignLeft size={13} /> : a === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px bg-line" />
                <button
                  className="focus-ring flex h-7 items-center gap-1 rounded-token-sm px-2 text-[0.78em] text-ink-muted hover:bg-surface hover:text-ink"
                  onClick={() => session.convert(selectedOne.id, 'paragraph')}
                  aria-label="Clear formatting"
                >
                  <Eraser size={13} />
                  Clear
                </button>
              </div>
            )}

            {/* floating selection chip */}
            {session.selection.length > 0 && layout.mode === 'page' && (
              <div className="glass-panel absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-token-full border border-line px-3 py-1.5 text-[0.8em] shadow-pop">
                <span className="font-semibold">{session.selection.length} selected</span>
                <span className="hidden items-center gap-1 text-ink-faint sm:flex">
                  <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> move
                </span>
                <button
                  className="focus-ring rounded-token-sm px-1.5 py-0.5 text-ink-faint hover:bg-surface hover:text-ink"
                  onClick={() => session.remove(session.selection)}
                  aria-label="Delete selected blocks"
                >
                  Delete
                </button>
                <button
                  className="focus-ring flex h-5 w-5 items-center justify-center rounded-token-sm text-ink-faint hover:bg-surface hover:text-ink"
                  onClick={() => session.clearSelection()}
                  aria-label="Clear selection"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* bottom hint strip */}
            <div className="pointer-events-none absolute bottom-4 right-4 hidden items-center gap-2 text-[0.72em] text-ink-faint lg:flex">
              <MousePointer2 size={12} />
              <span>drag onto a block: center converts, edges split into columns</span>
              <Kbd>Ctrl K</Kbd>
              <span>palette</span>
            </div>
          </div>

          {/* ------- right inspector ------- */}
          {layout.rightOpen && (
            <RightPanel
              page={page}
              selected={selectedOne}
              selectionCount={session.selection.length}
              session={session}
              width={layout.rightW}
              onResize={(w) => patchLayout({ rightW: w })}
              onOpenComments={() => {
                if (selectedOne) {
                  setCommentsFor(selectedOne.id)
                  setOverlay('comments')
                }
              }}
            />
          )}
        </div>

        {/* drag preview */}
        <DragOverlay dropAnimation={null}>
          {dragInfo?.kind === 'chip' ? (
            <div className="glass-panel flex items-center gap-2 rounded-token-md border border-primary/40 px-3 py-1.5 text-[0.85em] text-ink shadow-pop">
              <span className="text-primary">{BLOCK_ICON[dragInfo.blockType]}</span>
              {BLOCK_LABEL[dragInfo.blockType]}
            </div>
          ) : dragInfo?.kind === 'block' ? (
            <div className="glass-panel rounded-token-md border border-primary/40 px-3 py-1.5 text-[0.85em] text-ink shadow-pop">
              {dragInfo.blockIds.length > 1
                ? `${dragInfo.blockIds.length} blocks`
                : BLOCK_LABEL[session.blocks.find((b) => b.id === dragInfo.blockIds[0])?.type ?? 'paragraph']}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ------- drawers ------- */}
      {overlay === 'history' && <HistoryDrawer session={session} onClose={() => setOverlay(null)} />}
      {overlay === 'snapshots' && (
        <SnapshotsDrawer pageId={page.id} session={session} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'comments' && commentsFor && (
        <CommentsDrawer
          page={page}
          blockId={commentsFor}
          onClose={() => {
            setOverlay(null)
            setCommentsFor(null)
          }}
        />
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
    </div>
  )
}