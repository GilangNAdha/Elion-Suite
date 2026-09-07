import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MousePointer2, Type, Square, Circle, Diamond, MoveUpRight, Pen,
  ZoomIn, ZoomOut, Maximize, Crosshair, Grid3x3
} from 'lucide-react'
import type { Block, BlockType } from '../../lib/types'
import { uid } from '../../lib/types'
import type { EditorSession } from './useEditorSession'
import { BlockView, BlockToolbar } from './blocks'
import { IconBtn } from '../ui'

type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'pen'

interface View {
  x: number
  y: number
  zoom: number
}

const DEFAULT_W = 280

export interface EdgelessApi {
  onMove: (p: { x: number; y: number }) => void
  onEnd: (p: { x: number; y: number }) => void
  dragKind: 'chip' | 'block' | null
  dragType?: BlockType
  dragIds?: string[]
}

export function EdgelessCanvas({
  session,
  api,
  pokeToolbar,
  onOpenComments
}: {
  session: EditorSession
  api: React.MutableRefObject<EdgelessApi>
  pokeToolbar: () => void
  onOpenComments?: (id: string) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 60, y: 60, zoom: 1 })
  const [tool, setTool] = useState<Tool>('select')
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [draft, setDraft] = useState<{ start: { x: number; y: number }; end: { x: number; y: number }; points?: { x: number; y: number }[] } | null>(null)
  const [edgeHit, setEdgeHit] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)

  const viewRef = useRef(view)
  viewRef.current = view

  const toCanvas = useCallback((p: { x: number; y: number }) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: (p.x - r.left - v.x) / v.zoom,
      y: (p.y - r.top - v.y) / v.zoom
    }
  }, [])

  // ---- DnD hooks (drives intent while dragging from the library or a block) ----
  useEffect(() => {
    api.current = {
      dragKind: null,
      onMove: (p) => {
        const el = canvasRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) {
          setGhost(null)
          setEdgeHit(null)
          return
        }
        const cp = toCanvas(p)
        setGhost(cp)
        // hit-test against rendered block rects (viewport coords)
        let hit: string | null = null
        el.querySelectorAll<HTMLElement>('[data-block]').forEach((b) => {
          const br = b.getBoundingClientRect()
          if (p.x >= br.left && p.x <= br.right && p.y >= br.top && p.y <= br.bottom) hit = b.dataset.block!
        })
        setEdgeHit(hit)
      },
      onEnd: (p) => {
        const cp = toCanvas(p)
        const kind = api.current.dragKind
        const hit = edgeHitRef.current
        setGhost(null)
        setEdgeHit(null)
        if (kind === 'chip' && api.current.dragType) {
          if (hit) {
            session.convert(hit, api.current.dragType)
          } else {
            const id = session.insertNew(api.current.dragType)
            session.patchBlock(id, {
              pos: { x: cp.x - DEFAULT_W / 2, y: cp.y - 24, w: DEFAULT_W, h: 60 }
            })
          }
        } else if (kind === 'block' && api.current.dragIds?.length) {
          const ids = api.current.dragIds
          if (hit && !ids.includes(hit)) {
            // swap positions
            const a = session.blocks.find((b) => b.id === ids[0])
            const b2 = session.blocks.find((b) => b.id === hit)
            if (a?.pos && b2?.pos) {
              session.commit('Swapped block positions', (cur) =>
                cur.map((b) =>
                  b.id === ids[0] ? { ...b, pos: { ...b2.pos! } } : b.id === hit ? { ...b, pos: { ...a.pos! } } : b
                )
              )
              return
            }
          }
          const id = ids[0]
          const cur = session.blocks.find((b) => b.id === id)
          session.patchBlock(id, {
            pos: { x: cp.x - (cur?.pos?.w ?? DEFAULT_W) / 2, y: cp.y - 20, w: cur?.pos?.w ?? DEFAULT_W, h: cur?.pos?.h ?? 80 }
          })
        }
      }
    }
  }, [api, session, toCanvas])

  const edgeHitRef = useRef<string | null>(null)
  edgeHitRef.current = edgeHit

  // ---- wheel: pan / ctrl+wheel: zoom at cursor ----
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        const next = Math.min(2.5, Math.max(0.15, v.zoom * factor))
        const r = el.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        const k = next / v.zoom
        setView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, zoom: next })
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- background pointer: pan / marquee / tools ----
  const onBackgroundDown = (e: React.PointerEvent) => {
    const el = canvasRef.current
    if (!el) return
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return
    const cp = toCanvas({ x: e.clientX, y: e.clientY })
    const start = { x: e.clientX, y: e.clientY }

    const panMode = tool !== 'select' ? false : e.button === 1 || e.button === 0
    const toolMode = tool !== 'select'

    if (toolMode) {
      // click / drag drawing
      const startCanvas = toCanvas({ x: e.clientX, y: e.clientY })
      setDraft({ start: startCanvas, end: startCanvas, points: tool === 'pen' ? [startCanvas] : undefined })
      const onMove = (ev: PointerEvent) => {
        const cpv = toCanvas({ x: ev.clientX, y: ev.clientY })
        setDraft((d) =>
          d
            ? {
                ...d,
                end: cpv,
                points: d.points ? [...d.points, cpv] : d.points
              }
            : d
        )
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDraft((d) => {
          if (d) {
            if (tool === 'text') {
              const id = session.insertNew('text')
              session.patchBlock(id, { pos: { x: cp.x - DEFAULT_W / 2, y: cp.y - 24, w: DEFAULT_W, h: 48 } })
            } else if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
              const x = Math.min(d.start.x, d.end.x)
              const y = Math.min(d.start.y, d.end.y)
              const w = Math.max(60, Math.abs(d.end.x - d.start.x))
              const h = Math.max(50, Math.abs(d.end.y - d.start.y))
              const id = session.insertNew('shape')
              session.patchBlock(id, {
                pos: { x, y, w, h },
                props: { kind: tool, fill: 'var(--primary-soft)' }
              })
            } else if (tool === 'arrow') {
              const id = session.insertNew('arrow')
              const x = Math.min(d.start.x, d.end.x)
              const y = Math.min(d.start.y, d.end.y)
              const w = Math.max(40, Math.abs(d.end.x - d.start.x))
              const h = Math.max(40, Math.abs(d.end.y - d.start.y))
              session.patchBlock(id, {
                pos: { x, y, w, h },
                props: { from: { x: d.start.x - x, y: d.start.y - y }, to: { x: d.end.x - x, y: d.end.y - y } }
              })
            } else if (tool === 'pen' && d.points && d.points.length > 1) {
              const xs = d.points.map((p) => p.x)
              const ys = d.points.map((p) => p.y)
              const x = Math.min(...xs)
              const y = Math.min(...ys)
              const w = Math.max(40, Math.max(...xs) - x)
              const h = Math.max(30, Math.max(...ys) - y)
              const id = session.insertNew('pen')
              session.patchBlock(id, {
                pos: { x, y, w, h },
                props: { points: d.points.map((p) => [p.x - x, p.y - y] as [number, number]) }
              })
            }
          }
          return null
        })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    // select tool: pan + marquee
    if (e.button === 0) {
      const v0 = { ...viewRef.current }
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x
        const dy = ev.clientY - start.y
        const isPan = Math.hypot(dx, dy) < 4 || ev.buttons === 1
        if (isPan) {
          setView({ ...v0, x: v0.x + dx, y: v0.y + dy })
          return
        }
        setMarquee({
          x1: start.x,
          y1: start.y,
          x2: ev.clientX,
          y2: ev.clientY
        })
        // live selection
        const minX = Math.min(start.x, ev.clientX)
        const maxX = Math.max(start.x, ev.clientX)
        const minY = Math.min(start.y, ev.clientY)
        const maxY = Math.max(start.y, ev.clientY)
        const hits: string[] = []
        el.querySelectorAll<HTMLElement>('[data-block]').forEach((b) => {
          const br = b.getBoundingClientRect()
          if (br.left < maxX && br.left + br.width > minX && br.top < maxY && br.top + br.height > minY) {
            hits.push(b.dataset.block!)
          }
        })
        const merged = Array.from(new Set([...session.selection, ...hits]))
        session.setSelection(merged)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setTimeout(() => setMarquee(null), 0)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      session.clearSelection()
      return
    }
  }

  const fit = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const placed = session.blocks.filter((b) => b.pos)
    if (placed.length === 0) {
      setView({ x: 60, y: 60, zoom: 1 })
      return
    }
    const minX = Math.min(...placed.map((b) => b.pos!.x))
    const minY = Math.min(...placed.map((b) => b.pos!.y))
    const maxX = Math.max(...placed.map((b) => b.pos!.x + (b.pos!.w ?? DEFAULT_W)))
    const maxY = Math.max(...placed.map((b) => b.pos!.y + (b.pos!.h ?? 80)))
    const bw = maxX - minX + 80
    const bh = maxY - minY + 80
    const zoom = Math.min(1.2, Math.max(0.15, Math.min(r.width / bw, r.height / bh)))
    setView({
      x: (r.width - bw * zoom) / 2 - minX * zoom + 40 * zoom,
      y: (r.height - bh * zoom) / 2 - minY * zoom + 40 * zoom,
      zoom
    })
  }, [session.blocks])

  const zoomToSelection = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const sel = session.blocks.filter((b) => session.selection.includes(b.id) && b.pos)
    const list = sel.length ? sel : session.blocks.filter((b) => b.pos)
    if (list.length === 0) return
    const r = el.getBoundingClientRect()
    const minX = Math.min(...list.map((b) => b.pos!.x))
    const minY = Math.min(...list.map((b) => b.pos!.y))
    const maxX = Math.max(...list.map((b) => b.pos!.x + (b.pos!.w ?? DEFAULT_W)))
    const maxY = Math.max(...list.map((b) => b.pos!.y + (b.pos!.h ?? 80)))
    const bw = maxX - minX + 60
    const bh = maxY - minY + 60
    const zoom = Math.min(1.5, Math.max(0.2, Math.min(r.width / bw, r.height / bh)))
    setView({
      x: r.width / 2 - ((minX + maxX) / 2) * zoom,
      y: r.height / 2 - ((minY + maxY) / 2) * zoom,
      zoom
    })
  }, [session])

  const placed = useMemo(() => session.blocks.filter((b) => b.pos), [session.blocks])
  const pct = Math.round(view.zoom * 100)

  return (
    <div
      ref={canvasRef}
      data-canvas="1"
      className="relative h-full w-full overflow-hidden"
      style={{
        cursor: tool === 'select' ? 'grab' : 'crosshair',
        backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)',
        backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`
      }}
      onPointerDown={onBackgroundDown}
    >
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}
      >
        {placed.map((b) => (
          <EdgelessBlock
            key={b.id}
            block={b}
            session={session}
            selected={session.selection.includes(b.id)}
            hit={edgeHit === b.id}
            onOpenComments={onOpenComments ? () => onOpenComments(b.id) : undefined}
            onClick={(e) => {
              e.stopPropagation()
              if (e.shiftKey) session.toggleSelection(b.id)
              else if (!session.selection.includes(b.id)) session.setSelection([b.id])
            }}
          />
        ))}

        {/* draft preview */}
        {draft && (
          <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }} width="1" height="1" aria-hidden>
            {(draft.start.x < draft.end.x || draft.start.y < draft.end.y) && (
              <>
                {(tool === 'rect' || tool === 'diamond') && (
                  <rect
                    x={Math.min(draft.start.x, draft.end.x)}
                    y={Math.min(draft.start.y, draft.end.y)}
                    width={Math.max(4, Math.abs(draft.end.x - draft.start.x))}
                    height={Math.max(4, Math.abs(draft.end.y - draft.start.y))}
                    fill="var(--primary-soft)"
                    stroke="var(--primary)"
                    strokeDasharray="4 3"
                  />
                )}
                {tool === 'ellipse' && (
                  <ellipse
                    cx={(draft.start.x + draft.end.x) / 2}
                    cy={(draft.start.y + draft.end.y) / 2}
                    rx={Math.max(4, Math.abs(draft.end.x - draft.start.x) / 2)}
                    ry={Math.max(4, Math.abs(draft.end.y - draft.start.y) / 2)}
                    fill="var(--primary-soft)"
                    stroke="var(--primary)"
                    strokeDasharray="4 3"
                  />
                )}
                {(tool === 'arrow' || tool === 'pen') && (
                  <line
                    x1={draft.start.x}
                    y1={draft.start.y}
                    x2={draft.end.x}
                    y2={draft.end.y}
                    stroke="var(--primary)"
                    strokeWidth={2 / view.zoom}
                    strokeDasharray="6 4"
                  />
                )}
              </>
            )}
          </svg>
        )}

        {/* chip drop ghost */}
        {ghost && (
          <div
            aria-hidden
            className="pointer-events-none absolute h-14 w-64 rounded-token border-2 border-dashed border-primary/70 bg-primary/10"
            style={{ left: ghost.x - 128, top: ghost.y - 28 }}
          />
        )}
      </div>

      {/* marquee (viewport coords) */}
      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 border border-primary/70 bg-primary/10"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1)
          }}
        />
      )}

      {/* bottom-center tools */}
      <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
        <div className="glass-panel elev-overlay flex items-center gap-0.5 rounded-token border border-line p-1" role="toolbar" aria-label="Canvas tools">
          {(
            [
              ['select', MousePointer2, 'Select & pan'],
              ['text', Type, 'Text tool'],
              ['rect', Square, 'Rectangle'],
              ['ellipse', Circle, 'Ellipse'],
              ['diamond', Diamond, 'Diamond'],
              ['arrow', MoveUpRight, 'Arrow'],
              ['pen', Pen, 'Pen']
            ] as [Tool, typeof Square, string][]
          ).map(([t, Icon, label]) => (
            <IconBtn key={t} label={label} active={tool === t} onClick={() => setTool(t)} className="h-8 w-8">
              <Icon size={15} />
            </IconBtn>
          ))}
        </div>
      </div>

      {/* bottom-right zoom controls */}
      <div className="absolute bottom-4 right-4 z-30">
        <div className="glass-panel elev-overlay flex items-center gap-1 rounded-token border border-line p-1" role="group" aria-label="Zoom">
          <IconBtn label="Zoom out" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.15, v.zoom / 1.2) }))}>
            <ZoomOut size={15} />
          </IconBtn>
          <button
            className="focus-ring w-14 rounded-token-sm py-1 text-center font-mono text-[0.8em] tabular-nums text-ink-muted hover:bg-surface"
            onClick={() => setView((v) => ({ ...v, zoom: 1 }))}
            aria-label={`Zoom ${pct}% — click to reset`}
          >
            {pct}%
          </button>
          <IconBtn label="Zoom in" onClick={() => setView((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.2) }))}>
            <ZoomIn size={15} />
          </IconBtn>
          <IconBtn label="Zoom to fit" onClick={fit}>
            <Maximize size={15} />
          </IconBtn>
          <IconBtn label="Zoom to selection" onClick={zoomToSelection}>
            <Crosshair size={15} />
          </IconBtn>
          <IconBtn
            label="Reset view"
            onClick={() => {
              setView({ x: 60, y: 60, zoom: 1 })
              pokeToolbar()
            }}
          >
            <Grid3x3 size={15} />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}

function EdgelessBlock({
  block,
  session,
  selected,
  hit,
  onClick,
  onOpenComments
}: {
  block: Block
  session: EditorSession
  selected: boolean
  hit: boolean
  onClick: (e: React.MouseEvent) => void
  onOpenComments?: () => void
}) {
  const pos = block.pos!
  return (
    <div
      data-block={block.id}
      className={`elev-raised absolute rounded-token border bg-raised ${
        hit ? 'border-primary ring-2 ring-primary' : selected ? 'border-primary' : 'border-line'
      }`}
      style={{ left: pos.x, top: pos.y, width: pos.w ?? DEFAULT_W, minHeight: pos.h ?? 60 }}
      onClick={onClick}
    >
      <div className="p-2">
        <BlockView block={block} session={session} edgeless selected={selected} />
      </div>
      <BlockToolbar block={block} session={session} onOpenComments={onOpenComments ?? (() => undefined)} />
    </div>
  )
}
