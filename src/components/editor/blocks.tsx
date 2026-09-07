import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo,
  Quote, Code, AlertTriangle, Minus, Image, Images, Columns2, Table2,
  GripVertical, MessageSquare, Trash2, ChevronDown, Mic, Upload,
  Frame, GitBranch, Swords, Copy
} from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import type { Block, BlockType } from '../../lib/types'
import { BLOCK_LABEL, TEXT_BLOCK_TYPES } from '../../lib/blockEngine'
import type { EditorSession } from './useEditorSession'
import { Menu, MenuItem, MenuLabel, MenuSep } from '../ui'
import { DatabaseBlock } from '../items/DatabaseBlock'
import { useItemsStore } from '../../stores/itemsStore'
import { useToasts } from '../ui'
import { useSettingsStore } from '../../stores/settingsStore'
import { DuelPet } from '../pet/DuelPet'

export const BLOCK_ICON: Record<BlockType, ReactNode> = {
  paragraph: <Type size={14} />,
  heading1: <Heading1 size={14} />,
  heading2: <Heading2 size={14} />,
  heading3: <Heading3 size={14} />,
  bullet: <List size={14} />,
  numbered: <ListOrdered size={14} />,
  todo: <ListTodo size={14} />,
  quote: <Quote size={14} />,
  code: <Code size={14} />,
  callout: <AlertTriangle size={14} />,
  divider: <Minus size={14} />,
  image: <Image size={14} />,
  gallery: <Images size={14} />,
  columns: <Columns2 size={14} />,
  database: <Table2 size={14} />,
  text: <Type size={14} />,
  shape: <Minus size={14} />,
  arrow: <Minus size={14} />,
  pen: <Minus size={14} />,
  frame: <Frame size={14} />,
  edge: <GitBranch size={14} />,
  duel: <Swords size={14} />
}

/** Slash menu (§15.2) — content block types, in insertion order. */
const SLASH_TYPES: BlockType[] = [
  'paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo',
  'quote', 'code', 'callout', 'divider', 'image', 'gallery', 'columns', 'frame', 'duel'
]

const TYPE_CLASS: Record<BlockType, string> = {
  paragraph: 'text-[1em] leading-relaxed',
  heading1: 'text-[1.6em] font-bold leading-snug tracking-tight',
  heading2: 'text-[1.3em] font-semibold leading-snug tracking-tight',
  heading3: 'text-[1.1em] font-semibold leading-snug',
  bullet: 'text-[1em] leading-relaxed',
  numbered: 'text-[1em] leading-relaxed',
  todo: 'text-[1em] leading-relaxed',
  quote: 'text-[1.02em] italic leading-relaxed',
  code: 'font-mono text-[0.85em] leading-relaxed whitespace-pre-wrap',
  callout: 'text-[0.95em] leading-relaxed',
  divider: '',
  image: 'text-[0.8em] text-ink-muted',
  gallery: 'text-[0.8em] text-ink-muted',
  columns: '',
  database: '',
  text: 'text-[1em] leading-relaxed',
  shape: '',
  arrow: '',
  pen: '',
  frame: 'text-[0.9em] font-semibold',
  edge: '',
  duel: ''
}

/** §15.8 block styling — theme tokens only. */
const BG_CLASS: Record<string, string> = {
  surface: 'bg-surface',
  raised: 'bg-raised',
  'primary-soft': 'bg-primary-soft',
  'ok-soft': 'bg-ok/10',
  'warn-soft': 'bg-warn/10',
  'bad-soft': 'bg-bad/10'
}
const BG_OPTIONS = Object.keys(BG_CLASS)

// ---------------------------------------------------------------------------
// contenteditable text helper
// ---------------------------------------------------------------------------

function focusEnd(el: HTMLElement): void {
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

interface EditableProps {
  block: Block
  session: EditorSession
  onEnter?: () => void
  readOnly?: boolean
}

export function Editable({ block, session, onEnter, readOnly = false }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  // §15.2 slash menu: text starting with "/" becomes a block-type query
  const [slashIndex, setSlashIndex] = useState(0)
  const slashQuery = !readOnly && block.content.startsWith('/') ? block.content.slice(1) : null
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.trim().toLowerCase()
    return SLASH_TYPES.filter((t) => BLOCK_LABEL[t].toLowerCase().includes(q) || t.includes(q))
  }, [slashQuery])
  const slashOpen = slashQuery !== null && slashMatches.length > 0

  const applySlash = (t: BlockType) => {
    const rest = block.content.slice(1)
    session.setBlockContent(block.id, rest)
    if (TEXT_BLOCK_TYPES.includes(block.type)) session.convert(block.id, t)
    else session.insertNew(t, nullAfter(block, session))
    requestAnimationFrame(() => ref.current?.focus())
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el && (el.textContent ?? '') !== block.content) {
      el.textContent = block.content
    }
  }, [block.content, block.id])

  useEffect(() => setSlashIndex(0), [slashQuery])

  useEffect(() => {
    if (session.focusRequest?.id === block.id) {
      const el = ref.current
      if (el) requestAnimationFrame(() => focusEnd(el))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.focusRequest, block.id])

  if (readOnly) {
    return (
      <div
        className={`min-w-0 flex-1 ${TYPE_CLASS[block.type]}`}
        style={{ whiteSpace: 'pre-wrap' }}
        dangerouslySetInnerHTML={{ __html: escapeHtml(block.content) }}
      />
    )
  }

  return (
    <span className="relative min-w-0 flex-1">
      <div
        ref={ref}
        role="textbox"
        aria-label={BLOCK_LABEL[block.type]}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-block-id={block.id}
        className={`block-text focus-ring min-w-0 rounded-sm ${TYPE_CLASS[block.type]} ${
          block.type === 'todo' && block.checked ? 'line-through opacity-60' : ''
        } ${slashOpen ? 'opacity-40' : ''}`}
        style={{ whiteSpace: 'pre-wrap' }}
        onInput={(e) => session.setBlockContent(block.id, e.currentTarget.textContent ?? '')}
        onFocus={() => {
          session.focusContent.current.set(block.id, block.content)
        }}
        onBlur={() => session.commitTextEdit(block.id)}
        onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
          if (slashOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSlashIndex((i) => (i + 1) % slashMatches.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              applySlash(slashMatches[slashIndex])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              session.setBlockContent(block.id, block.content.slice(1))
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey && onEnter) {
            e.preventDefault()
            onEnter()
          } else if ((e.key === 'Delete' || e.key === 'Backspace') && (e.currentTarget.textContent ?? '') === '') {
            e.preventDefault()
            session.remove([block.id])
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          const t = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, t)
        }}
      />
      {slashOpen && (
        <div
          role="listbox"
          aria-label="Insert block type"
          className="elev-overlay absolute left-0 top-full z-40 mt-1 max-h-72 w-60 overflow-auto rounded-token border border-line bg-raised p-1 shadow-lg"
        >
          {slashMatches.map((t, i) => (
            <button
              key={t}
              role="option"
              aria-selected={i === slashIndex}
              className={`focus-ring flex w-full items-center gap-2 rounded-token-sm px-2 py-1.5 text-left text-[0.85em] ${
                i === slashIndex ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                applySlash(t)
              }}
              onMouseEnter={() => setSlashIndex(i)}
            >
              <span className="text-ink-muted">{BLOCK_ICON[t]}</span>
              {BLOCK_LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Block view
// ---------------------------------------------------------------------------

export function BlockView({
  block,
  session,
  edgeless = false,
  selected = false,
  dimmed = false
}: {
  block: Block
  session: EditorSession
  edgeless?: boolean
  selected?: boolean
  dimmed?: boolean
}) {
  let body: ReactNode
  switch (block.type) {
    case 'divider':
      body = <hr className="my-2 border-line" />
      break
    case 'image': {
      const src = String(block.props.src ?? '')
      body = (
        <div className="w-full">
          {src ? (
            <img src={src} alt={block.content || 'image'} className="max-h-96 w-full rounded-token object-cover" />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-token border border-dashed border-line text-ink-faint">
              <Image size={22} />
            </div>
          )}
          <input
            aria-label="Image caption"
            className="mt-1 w-full bg-transparent text-center text-[0.8em] text-ink-faint outline-none"
            placeholder="Caption…"
            defaultValue={block.content}
            key={block.content}
            onBlur={(e) => {
              if (e.target.value !== block.content) session.patchBlock(block.id, { content: e.target.value })
            }}
          />
        </div>
      )
      break
    }
    case 'gallery': {
      const items = (block.props.items as { src: string; caption: string }[] | undefined) ?? []
      body = (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it, i) => (
            <figure key={i} className="overflow-hidden rounded-token border border-line">
              {it.src && <img src={it.src} alt={it.caption || 'gallery image'} className="h-28 w-full object-cover" />}
              {it.caption && (
                <figcaption className="truncate px-2 py-1 text-[0.75em] text-ink-muted">{it.caption}</figcaption>
              )}
            </figure>
          ))}
          <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-token border border-dashed border-line text-ink-faint hover:border-primary hover:text-primary">
            <Upload size={16} />
            <span className="text-[0.75em]">Add</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => {
                  const next = [...items, { src: String(reader.result), caption: '' }]
                  session.patchBlock(block.id, { props: { items: next } })
                }
                reader.readAsDataURL(f)
              }}
            />
          </label>
        </div>
      )
      break
    }
    case 'columns': {
      const cols = (block.props.cols as string[][] | undefined) ?? [[], []]
      body = (
        <div className="grid grid-cols-2 gap-3 rounded-token border border-line p-2">
          {cols.map((col, i) => (
            <div key={i} className="min-w-0 space-y-1">
              {col
                .map((id) => session.blocks.find((b) => b.id === id))
                .filter((b): b is Block => !!b)
                .sort((a, b) => a.order - b.order)
                .map((c) => (
                  <BlockView key={c.id} block={c} session={session} selected={session.selection.includes(c.id)} />
                ))}
            </div>
          ))}
        </div>
      )
      break
    }
    case 'database': {
      const dbId = String(block.props.dbId ?? '')
      body = <DatabaseBlock dbId={dbId} compact={edgeless} />
      break
    }
    case 'frame': {
      const titleInput = (extraClass = '') => (
        <input
          aria-label="Frame title"
          className={`w-full bg-transparent text-[0.9em] font-semibold text-ink-muted outline-none placeholder:text-ink-faint ${extraClass}`}
          placeholder="Frame title"
          defaultValue={String(block.props.title ?? '')}
          key={String(block.props.title ?? '')}
          onBlur={(e) => {
            if (e.target.value !== block.props.title)
              session.patchBlock(block.id, { props: { ...block.props, title: e.target.value } })
          }}
        />
      )
      const kids = session.blocks
        .filter((b) => b.parentId === block.id)
        .sort((a, b) => a.order - b.order)
      // Both modes show the children — in Edgeless they are stacked inside the
      // frame chrome (free-positioned blocks that land on the frame are
      // re-parented via drag-drop instead).
      body = (
        <div
          className={`rounded-token border border-dashed border-line-strong bg-surface/25 p-2 ${edgeless ? 'flex h-full min-h-[70%] w-full flex-col' : 'my-2'}`}
        >
          {titleInput(edgeless ? 'mb-1 shrink-0' : 'mb-2')}
          <div className={edgeless ? 'min-h-0 flex-1 space-y-1 overflow-hidden' : 'space-y-1'}>
            {kids.map((c) => (
              <BlockView key={c.id} block={c} session={session} selected={session.selection.includes(c.id)} />
            ))}
            {kids.length === 0 && (
              <p className="text-[0.8em] text-ink-faint">
                {edgeless ? 'Drop blocks onto this frame to group them.' : 'Drag blocks here (or insert inside) to group them.'}
              </p>
            )}
          </div>
        </div>
      )
      break
    }
    case 'duel': {
      const moodProp = block.props.mood
      body = (
        <DuelPet
          compact
          mood={moodProp === 'idle' || moodProp === 'happy' || moodProp === 'worried' ? (moodProp as 'idle' | 'happy' | 'worried') : undefined}
        />
      )
      break
    }
    case 'edge':
      // edges render only in Edgeless mode (SVG overlay)
      body = null
      break
    case 'todo':
      body = (
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            aria-label="Toggle done"
            className="mt-1 h-4 w-4 accent-[var(--primary)]"
            checked={!!block.checked}
            onChange={(e) => session.patchBlock(block.id, { checked: e.target.checked })}
          />
          <Editable
            block={block}
            session={session}
            onEnter={() => session.insertNew('todo', nullAfter(block, session))}
          />
        </div>
      )
      break
    case 'shape': {
      const kind = String(block.props.kind ?? 'rect')
      const fill = String(block.props.fill ?? 'var(--primary-soft)')
      const h = edgeless ? Math.max(60, (block.pos?.h ?? 100)) : 90
      body = (
        <svg viewBox={`0 0 200 ${h}`} className="h-auto w-full" aria-label="Shape">
          {kind === 'rect' && <rect x="2" y="2" width="196" height={h - 4} rx="10" fill={fill} stroke="var(--line-strong)" />}
          {kind === 'ellipse' && <ellipse cx="100" cy={h / 2} rx="98" ry={h / 2 - 2} fill={fill} stroke="var(--line-strong)" />}
          {kind === 'diamond' && (
            <polygon points={`100,2 ${198},${h / 2} 100,${h - 2} 2,${h / 2}`} fill={fill} stroke="var(--line-strong)" />
          )}
        </svg>
      )
      break
    }
    case 'arrow': {
      const from = (block.props.from as { x: number; y: number } | undefined) ?? { x: 0, y: 0 }
      const to = (block.props.to as { x: number; y: number } | undefined) ?? { x: 200, y: 60 }
      body = (
        <svg viewBox="0 0 200 100" className="h-auto w-full overflow-visible" aria-label="Arrow">
          <line x1={from.x / 2} y1={from.y / 2} x2={to.x / 2} y2={to.y / 2} stroke="var(--ink-muted)" strokeWidth="2" />
          <polygon
            points={`${to.x / 2},${to.y / 2} ${to.x / 2 - 8},${to.y / 2 - 5} ${to.x / 2 - 8},${to.y / 2 + 5}`}
            fill="var(--ink-muted)"
          />
        </svg>
      )
      break
    }
    case 'pen': {
      const pts = (block.props.points as number[] | undefined) ?? []
      const str = pts.map((v, i) => `${(i % 2 === 0 ? v : v / 2) / 2},${(i % 2 === 1 ? v : v / 2) / 2}`).join(' ')
      body = (
        <svg viewBox="0 0 200 100" className="h-auto w-full overflow-visible" aria-label="Pen stroke">
          <polyline points={str} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
      break
    }
    default:
      body = (
        <Editable
          block={block}
          session={session}
          onEnter={() => {
            if (block.type === 'bullet') session.insertNew('bullet', nullAfter(block, session))
            else if (block.type === 'numbered') session.insertNew('numbered', nullAfter(block, session))
            else if (block.type === 'quote') session.insertNew('quote', nullAfter(block, session))
            else if (block.type === 'code') session.insertNew('code', nullAfter(block, session))
            else session.insertNew('paragraph', nullAfter(block, session))
          }}
        />
      )
  }

  const sibs = session.blocks
    .filter((b) => b.parentId === block.parentId && b.type === block.type)
    .sort((a, b) => a.order - b.order)
  const numberedIndex = block.type === 'numbered' ? sibs.findIndex((b) => b.id === block.id) + 1 : null

  const align = String(block.props.align ?? 'left')
  const listMarker =
    block.type === 'bullet' ? (
      <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
    ) : block.type === 'numbered' ? (
      <span aria-hidden className="mt-0.5 min-w-4 shrink-0 font-mono text-[0.8em] text-ink-muted">
        {numberedIndex}.
      </span>
    ) : null

  const bg = String(block.props.bg ?? '')
  const hasBorder = !!block.props.border

  return (
    <div
      data-block={block.id}
      tabIndex={-1}
      className={`group relative ${edgeless ? '' : 'px-1 py-0.5'} ${dimmed ? 'opacity-40' : ''} ${selected ? 'block-selected' : ''} ${
        bg && BG_CLASS[bg] ? `${BG_CLASS[bg]} rounded-token` : ''
      } ${hasBorder ? 'border border-line-strong' : ''}`}
      style={{
        textAlign: TEXT_BLOCK_TYPES.includes(block.type)
          ? align === 'center'
            ? 'center'
            : align === 'right'
              ? 'right'
              : 'left'
          : undefined
      }}
    >
      {block.type === 'quote' && (
        <div aria-hidden className="absolute inset-y-0 left-0 w-1 rounded bg-primary/50" />
      )}
      {block.type === 'callout' ? (
        <div className="flex gap-2 rounded-token border border-warn/30 bg-warn/10 p-3">
          <span className="mt-0.5 shrink-0 text-warn">
            <AlertTriangle size={15} />
          </span>
          {body}
        </div>
      ) : block.type === 'code' ? (
        <div className="rounded-token border border-line bg-sunken p-3 font-mono">{body}</div>
      ) : block.type === 'divider' ? (
        body
      ) : (
        <div className={block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered' ? 'flex items-start gap-2' : ''}>
          {listMarker}
          {body}
        </div>
      )}
    </div>
  )
}

export function nullAfter(block: Block, session: EditorSession): string | null {
  const sibs = session.blocks
    .filter((b) => b.parentId === block.parentId)
    .sort((a, b) => a.order - b.order)
  const next = sibs.find((b) => b.order > block.order)
  return next?.id ?? null
}

function nullBefore(block: Block, session: EditorSession): string | null {
  const sibs = session.blocks
    .filter((b) => b.parentId === block.parentId)
    .sort((a, b) => b.order - a.order)
  const prev = sibs.find((b) => b.order < block.order)
  return prev?.id ?? null
}

// ---------------------------------------------------------------------------
// Block toolbar — hover/selected. "Convert to…" is the keyboard-operable
// equivalent of drag-to-replace (hard a11y requirement, §11 #9).
// ---------------------------------------------------------------------------

export function BlockToolbar({
  block,
  session,
  onOpenComments
}: {
  block: Block
  session: EditorSession
  onOpenComments: () => void
}) {
  const selected = session.selection.length > 1 && session.selection.includes(block.id)
  const ids = selected ? session.selection : [block.id]
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { kind: 'block', blockIds: ids },
    disabled: block.type === 'divider'
  })

  return (
    <div
      className={`absolute -top-3 right-2 z-20 flex items-center gap-0.5 rounded-token-sm border border-line bg-raised p-0.5 shadow-sm transition-opacity ${
        isDragging ? 'opacity-30' : session.selection.includes(block.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-ink-faint hover:text-ink active:cursor-grabbing"
        aria-label="Drag to move block"
      >
        <GripVertical size={13} />
      </span>
      <Menu
        width={230}
        trigger={
          <span
            className="focus-ring flex h-6 items-center gap-1 rounded px-1.5 text-[0.75em] text-ink-muted hover:bg-surface hover:text-ink"
            aria-label={`Block actions for ${BLOCK_LABEL[block.type]}`}
          >
            <ChevronDown size={11} />
          </span>
        }
      >
        <MenuLabel>{BLOCK_LABEL[block.type]}</MenuLabel>
        <MenuItem
          label="Move up"
          shortcut="Alt+↑"
          onClick={() => session.move([block.id], nullBefore(block, session), block.parentId)}
        />
        <MenuItem
          label="Move down"
          shortcut="Alt+↓"
          onClick={() => session.move([block.id], nullAfter(block, session), block.parentId)}
        />
        <MenuItem
          icon={<Copy size={14} />}
          label={session.selection.length > 1 ? `Duplicate ${session.selection.length} blocks` : 'Duplicate'}
          onClick={() => session.duplicate(session.selection.length > 1 ? session.selection : [block.id])}
        />
        <MenuSep />
        <MenuLabel>Convert to…</MenuLabel>
        {(['heading1', 'heading2', 'heading3', 'paragraph', 'todo', 'bullet', 'numbered', 'quote', 'code', 'callout', 'text'] as BlockType[])
          .filter((t) => t !== block.type)
          .map((t) => (
            <MenuItem key={t} icon={BLOCK_ICON[t]} label={BLOCK_LABEL[t]} onClick={() => session.convert(block.id, t)} />
          ))}
        {block.type === 'image' && (
          <MenuItem icon={BLOCK_ICON.gallery} label="Gallery" onClick={() => session.convert(block.id, 'gallery')} />
        )}
        {block.type === 'gallery' && (
          <MenuItem icon={BLOCK_ICON.image} label="Single image" onClick={() => session.convert(block.id, 'image')} />
        )}
        <MenuSep />
        <MenuLabel>Background</MenuLabel>
        {BG_OPTIONS.map((b) => (
          <MenuItem
            key={b}
            label={b === 'surface' ? 'Surface' : b === 'raised' ? 'Raised' : b}
            active={String(block.props.bg ?? '') === b}
            onClick={() => session.patchBlock(block.id, { props: { ...block.props, bg: String(block.props.bg ?? '') === b ? '' : b } })}
          />
        ))}
        <MenuItem
          label="Border"
          active={!!block.props.border}
          onClick={() => session.patchBlock(block.id, { props: { ...block.props, border: !block.props.border ? true : undefined } })}
        />
        <MenuSep />
        <MenuItem icon={<MessageSquare size={14} />} label="Comments" onClick={onOpenComments} />
        <MenuItem icon={<Mic size={14} />} label="Dictate (voice)" onClick={() => void dictation(block, session)} />
        <MenuSep />
        <MenuItem
          icon={<Trash2 size={14} />}
          label={session.selection.length > 1 ? `Delete ${session.selection.length} blocks` : 'Delete block'}
          shortcut="Del"
          danger
          onClick={() => session.remove(session.selection.length > 1 ? session.selection : [block.id])}
        />
      </Menu>
    </div>
  )
}

async function dictation(block: Block, session: EditorSession): Promise<void> {
  const settings = useSettingsStore.getState()
  const push = useToasts.getState().push
  if (!settings.stt.enabled) {
    push('Speech-to-text is disabled in Settings', 'error')
    return
  }
  // lazy: the Whisper WASM runtime (~0.8 MB chunk) only loads on first use
  const { sttSupported, transcribe, startRecording } = await import('../../lib/stt')
  if (!sttSupported()) {
    push('Microphone not available in this browser', 'error')
    return
  }
  try {
    const rec = await startRecording()
    const audio = await rec.stop()
    const text = await transcribe(audio, settings.stt.model)
    if (text) {
      session.commit(`Dictated into ${BLOCK_LABEL[block.type].toLowerCase()}`, (cur) =>
        cur.map((b) => (b.id === block.id ? { ...b, content: (b.content ? b.content + ' ' : '') + text } : b))
      )
      session.requestFocus(block.id)
      push('Transcription inserted', 'success')
    } else {
      push('No speech detected')
    }
  } catch {
    push('Microphone unavailable or permission denied', 'error')
  }
}
