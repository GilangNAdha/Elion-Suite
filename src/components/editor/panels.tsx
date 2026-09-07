import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDraggable } from '@dnd-kit/core'
import {
  FileText, Plus, FolderPlus, History as HistoryIcon, Camera, Trash2,
  RotateCcw, X, AlignLeft, AlignCenter, AlignRight, Link2, Mic, CornerUpLeft
} from 'lucide-react'
import type { PageRecord, Block, BlockType } from '../../lib/types'
import { BLOCK_CATEGORIES } from '../../lib/blockEngine'
import { BLOCK_ICON } from './blocks'
import type { EditorSession } from './useEditorSession'
import { Button, IconBtn, Input, Select, Tabs, Toggle, MenuLabel, Menu, MenuItem, Kbd } from '../ui'
import { usePagesStore } from '../../stores/pagesStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { timeAgo } from '../../lib/time'

// ---------------------------------------------------------------------------
// Drawer shell
// ---------------------------------------------------------------------------

export function Drawer({
  title,
  icon,
  onClose,
  children,
  footer
}: {
  title: string
  icon?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <aside className="elev-overlay absolute bottom-0 right-0 top-0 z-50 flex w-80 flex-col border-l border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-2 text-[0.95em] font-semibold">
          {icon}
          {title}
        </span>
        <IconBtn label="Close panel" onClick={onClose}>
          <X size={15} />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{children}</div>
      {footer && <div className="border-t border-line p-2">{footer}</div>}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Left panel: outline + block library
// ---------------------------------------------------------------------------

export function LeftPanel({
  page,
  tab,
  onTab,
  width,
  onResize,
  onInsertBlock
}: {
  page: PageRecord
  tab: 'outline' | 'library'
  onTab: (t: 'outline' | 'library') => void
  width: number
  onResize: (w: number) => void
  onInsertBlock: (t: BlockType) => void
}) {
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)
  const createPage = usePagesStore((s) => s.createPage)
  const startResize = (e: React.PointerEvent) => {
    const startX = e.clientX
    const startW = width
    const onMove = (ev: PointerEvent) => {
      onResize(Math.max(200, Math.min(420, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const roots = Object.values(pages)
    .filter((p) => p.branch === page.branch && p.parentId === null)
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="glass-panel relative flex h-full min-h-0 flex-col border-r border-line">
      <div className="p-2">
        <Tabs
          tabs={[
            { id: 'outline', label: 'Outline' },
            { id: 'library', label: 'Blocks' }
          ]}
          value={tab}
          onChange={onTab}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {tab === 'outline' ? (
          <OutlineTree page={page} roots={roots} depth={0} />
        ) : (
          <BlockLibrary onInsertBlock={onInsertBlock} />
        )}
      </div>
      <div
        role="separator"
        aria-label="Resize left panel"
        className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-primary/40"
        onPointerDown={startResize}
      />
      <div className="border-t border-line p-2">
        <Button
          size="sm"
          variant="soft"
          className="w-full"
          icon={<FolderPlus size={14} />}
          onClick={async () => {
            const p = await createPage({ title: 'Untitled', branch: page.branch, parentId: page.id })
            navigate(page.branch === 'personal' ? `/notes/${p.id}/edit` : `/workspace/${p.id}/edit`)
          }}
        >
          New sub-page
        </Button>
      </div>
    </div>
  )
}

function OutlineTree({ page, roots, depth }: { page: PageRecord; roots: PageRecord[]; depth: number }) {
  const navigate = useNavigate()
  const renamePage = usePagesStore((s) => s.renamePage)
  return (
    <ul className="space-y-0.5" role="tree" aria-label="Page outline">
      {roots.map((p) => (
        <li key={p.id} role="treeitem" aria-expanded>
          <button
            className={`focus-ring flex w-full items-center gap-1.5 rounded-token-sm px-2 py-1.5 text-left text-[0.88em] ${
              p.id === page.id ? 'bg-primary-soft font-medium text-primary' : 'text-ink-muted hover:bg-raised hover:text-ink'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() =>
              navigate(p.branch === 'personal' ? `/notes/${p.id}/edit` : `/workspace/${p.id}/edit`)
            }
            onDoubleClick={async () => {
              const name = window.prompt('Rename page', p.title)
              if (name?.trim()) await renamePage(p.id, name.trim())
            }}
          >
            <FileText size={13} className="shrink-0" />
            <span className="truncate">{p.title}</span>
          </button>
          <OutlineChildren pageId={p.id} depth={depth + 1} current={page.id} />
        </li>
      ))}
    </ul>
  )
}

function OutlineChildren({ pageId, depth, current }: { pageId: string; depth: number; current: string }) {
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)
  const children = Object.values(pages)
    .filter((p) => p.parentId === pageId)
    .sort((a, b) => a.title.localeCompare(b.title))
  if (children.length === 0) return null
  return (
    <ul className="space-y-0.5">
      {children.map((c) => (
        <li key={c.id}>
          <button
            className={`focus-ring flex w-full items-center gap-1.5 rounded-token-sm px-2 py-1.5 text-left text-[0.86em] ${
              c.id === current ? 'bg-primary-soft font-medium text-primary' : 'text-ink-muted hover:bg-raised hover:text-ink'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() =>
              navigate(c.branch === 'personal' ? `/notes/${c.id}/edit` : `/workspace/${c.id}/edit`)
            }
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">{c.title}</span>
          </button>
          <OutlineChildren pageId={c.id} depth={depth + 1} current={current} />
        </li>
      ))}
    </ul>
  )
}

function BlockLibrary({ onInsertBlock }: { onInsertBlock: (t: BlockType) => void }) {
  return (
    <div className="space-y-3">
      {BLOCK_CATEGORIES.map((cat) => (
        <div key={cat.name}>
          <div className="mb-1 px-1 text-[0.72em] font-semibold uppercase tracking-wider text-ink-faint">
            {cat.name}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {cat.types.map((t) => (
              <LibraryChip key={t} type={t} onInsert={() => onInsertBlock(t)} />
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 text-[0.75em] leading-relaxed text-ink-faint">
        Drag a chip onto the page to insert — or drop it <em>on</em> a block to convert it in place, or onto a
        block’s edge to compose columns. Click to insert at the caret.
      </p>
    </div>
  )
}

function LibraryChip({ type, onInsert }: { type: BlockType; onInsert: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${type}`,
    data: { kind: 'chip', blockType: type }
  })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`focus-ring flex cursor-grab items-center gap-1.5 rounded-token-sm border border-line bg-surface/50 px-2 py-1.5 text-left text-[0.8em] text-ink-muted transition-all hover:border-primary/50 hover:text-ink active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
      onClick={onInsert}
      aria-label={`Insert ${type} block — drag onto the page, or click`}
    >
      <span className="text-ink-faint">{BLOCK_ICON[type]}</span>
      <span className="truncate capitalize">{type === 'heading1' ? 'Heading 1' : type === 'heading2' ? 'Heading 2' : type === 'heading3' ? 'Heading 3' : type}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Right panel: contextual inspector
// ---------------------------------------------------------------------------

const PAGE_ICONS = ['file-text', 'star', 'book-open', 'compass', 'target', 'zap', 'heart', 'rocket']

export function RightPanel({
  page,
  selected,
  selectionCount,
  session,
  width,
  onResize,
  onOpenComments
}: {
  page: PageRecord
  selected: Block | undefined
  selectionCount: number
  session: EditorSession
  width: number
  onResize: (w: number) => void
  onOpenComments: () => void
}) {
  const startResize = (e: React.PointerEvent) => {
    const startX = e.clientX
    const startW = width
    const onMove = (ev: PointerEvent) => onResize(Math.max(220, Math.min(420, startW - (ev.clientX - startX))))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="glass-panel relative flex h-full min-h-0 flex-col border-l border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[0.85em] font-semibold uppercase tracking-wider text-ink-faint">Inspector</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selectionCount > 1 ? (
          <BulkInspector session={session} />
        ) : selected ? (
          <BlockInspector block={selected} session={session} onOpenComments={onOpenComments} />
        ) : (
          <PageInspector page={page} session={session} />
        )}
      </div>
      <div
        role="separator"
        aria-label="Resize inspector"
        className="absolute inset-y-0 left-0 w-1 cursor-col-resize hover:bg-primary/40"
        onPointerDown={startResize}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[0.72em] font-semibold uppercase tracking-wider text-ink-faint">{title}</div>
      {children}
    </div>
  )
}

function BlockInspector({
  block,
  session,
  onOpenComments
}: {
  block: Block
  session: EditorSession
  onOpenComments: () => void
}) {
  const navigate = useNavigate()
  const [imageUrl, setImageUrl] = useState(String(block.props.src ?? ''))
  const isText = ['paragraph', 'heading1', 'heading2', 'heading3', 'quote', 'callout', 'todo', 'bullet', 'numbered', 'text'].includes(block.type)
  const align = String(block.props.align ?? 'left')

  return (
    <div>
      <Section title="Type">
        <Select
          value={block.type}
          aria-label="Block type"
          onChange={(e) => session.convert(block.id, e.target.value as BlockType)}
        >
          {(['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'quote', 'code', 'callout', 'text', 'divider', 'image', 'gallery', 'columns'] as BlockType[]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </Section>

      {isText && (
        <Section title="Alignment">
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                aria-label={`Align ${a}`}
                className={`focus-ring flex h-8 w-8 items-center justify-center rounded-token-sm border ${
                  align === a ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted hover:text-ink'
                }`}
                onClick={() => session.patchBlock(block.id, { props: { ...block.props, align: a } })}
              >
                {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
              </button>
            ))}
          </div>
        </Section>
      )}

      {block.type === 'image' && (
        <Section title="Image">
          <Input
            placeholder="https://…"
            value={imageUrl}
            aria-label="Image URL"
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="soft" onClick={() => session.patchBlock(block.id, { props: { ...block.props, src: imageUrl } })}>
              Apply URL
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-token-sm border border-line px-2.5 text-[0.85em] text-ink-muted hover:text-ink">
                Upload…
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => session.patchBlock(block.id, { props: { ...block.props, src: String(r.result) } })
                  r.readAsDataURL(f)
                }}
              />
            </label>
          </div>
        </Section>
      )}

      {block.type === 'shape' && (
        <Section title="Shape">
          <Select
            value={String(block.props.kind ?? 'rect')}
            aria-label="Shape kind"
            onChange={(e) => session.patchBlock(block.id, { props: { ...block.props, kind: e.target.value } })}
          >
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="diamond">Diamond</option>
          </Select>
          <div className="mt-2 flex gap-1.5">
            {['var(--primary-soft)', 'var(--ok)', 'var(--warn)', 'var(--bad)', 'var(--info)', 'var(--accent)'].map((c) => (
              <button
                key={c}
                aria-label={`Fill ${c}`}
                className="focus-ring h-6 w-6 rounded-full border border-line"
                style={{ background: c }}
                onClick={() => session.patchBlock(block.id, { props: { ...block.props, fill: c } })}
              />
            ))}
          </div>
        </Section>
      )}

      {block.type === 'todo' && (
        <Section title="Status">
          <Toggle
            label="Checked"
            checked={!!block.checked}
            onChange={(v) => session.patchBlock(block.id, { checked: v })}
          />
        </Section>
      )}

      {block.type === 'database' && (
        <Section title="Database">
          <Button
            size="sm"
            variant="soft"
            className="w-full"
            icon={<Link2 size={14} />}
            onClick={() => navigate(`/workspace/items/${String(block.props.dbId ?? '')}`)}
          >
            Open database view
          </Button>
        </Section>
      )}

      <Section title="Actions">
        <Button size="sm" variant="outline" className="w-full" icon={<Mic size={13} />} onClick={onOpenComments}>
          Comments
        </Button>
      </Section>
    </div>
  )
}

function BulkInspector({ session }: { session: EditorSession }) {
  return (
    <div>
      <Section title={`${session.selection.length} blocks selected`}>
        <div className="text-[0.85em] leading-relaxed text-ink-muted">
          Use the bar at the bottom of the canvas to convert, delete, or clear the selection.
        </div>
      </Section>
      <Section title="Alignment">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              aria-label={`Align selection ${a}`}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-token-sm border border-line text-ink-muted hover:text-ink"
              onClick={() =>
                session.selection.forEach((id) => {
                  const b = session.blocks.find((x) => x.id === id)
                  if (b) session.patchBlock(id, { props: { ...b.props, align: a } })
                })
              }
            >
              {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

function PageInspector({ page, session }: { page: PageRecord; session: EditorSession }) {
  const renamePage = usePagesStore((s) => s.renamePage)
  const saveTemplate = usePagesStore((s) => s.saveTemplate)
  const pages = usePagesStore((s) => s.pages)
  const profileName = useSettingsStore((s) => s.profileName)
  const [tplName, setTplName] = useState('')

  const backlinks = useMemo(() => {
    const needle = `[[${page.title}]]`
    return Object.values(pages)
      .filter((p) => p.id !== page.id && p.blocks.some((b) => b.content.includes(needle)))
  }, [pages, page.id, page.title])

  return (
    <div>
      <Section title="Page">
        <Input
          aria-label="Page title"
          value={page.title}
          key={page.id}
          onChange={(e) => void renamePage(page.id, e.target.value || page.title)}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {PAGE_ICONS.map((ic) => (
            <span key={ic} className="rounded-token-sm border border-line px-1.5 py-0.5 text-[0.7em] text-ink-faint">
              {ic}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Version">
        <Button size="sm" variant="soft" className="w-full" icon={<Camera size={13} />} onClick={() => session.takeSnapshot('Manual snapshot')}>
          Snapshot now
        </Button>
        <p className="mt-1.5 text-[0.75em] text-ink-faint">
          Snapshots are local-only (Time Machine). Auto snapshot runs ~5 min after edits.
        </p>
      </Section>

      <Section title="Save as template">
        <div className="flex gap-1.5">
          <Input placeholder="Template name" value={tplName} aria-label="Template name" onChange={(e) => setTplName(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            disabled={!tplName.trim()}
            onClick={() => {
              void saveTemplate(tplName.trim(), 'page', {
                title: page.title,
                blocks: JSON.parse(JSON.stringify(session.blocks))
              })
              setTplName('')
            }}
          >
            Save
          </Button>
        </div>
      </Section>

      <Section title={`Backlinks (${backlinks.length})`}>
        {backlinks.length === 0 ? (
          <p className="text-[0.8em] text-ink-faint">
            No pages link to this page yet. Use <code className="rounded bg-sunken px-1">[[{page.title}]]</code> in any
            block.
          </p>
        ) : (
          <ul className="space-y-1">
            {backlinks.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 text-[0.85em] text-ink-muted">
                <Link2 size={12} className="text-ink-faint" />
                {p.title}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-[0.72em] text-ink-faint">
        Signed in as <strong className="text-ink-muted">{profileName}</strong> (local profile).
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History drawer — the visible, navigable undo stack (§9.1)
// ---------------------------------------------------------------------------

export function HistoryDrawer({ session, onClose }: { session: EditorSession; onClose: () => void }) {
  return (
    <Drawer title="History" icon={<HistoryIcon size={15} />} onClose={onClose}>
      <ol className="space-y-0.5">
        {session.history
          .map((h, i) => ({ h, i }))
          .reverse()
          .map(({ h, i }) => (
            <li key={i}>
              <button
                className={`focus-ring flex w-full items-center gap-2 rounded-token-sm px-2 py-1.5 text-left text-[0.85em] ${
                  i === session.historyIndex
                    ? 'bg-primary-soft font-medium text-primary'
                    : i < session.historyIndex
                      ? 'text-ink-muted hover:bg-surface'
                      : 'text-ink-faint hover:bg-surface'
                }`}
                onClick={() => session.jumpTo(i)}
              >
                <span className="w-6 shrink-0 text-right font-mono text-[0.75em]">{i + 1}</span>
                <span className="flex-1 truncate">{h.label}</span>
                {i === session.historyIndex && <CornerUpLeft size={12} className="shrink-0" />}
              </button>
            </li>
          ))}
      </ol>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// Snapshots drawer — local Time Machine
// ---------------------------------------------------------------------------

export function SnapshotsDrawer({
  pageId,
  session,
  onClose
}: {
  pageId: string
  session: EditorSession
  onClose: () => void
}) {
  const snapshots = usePagesStore((s) => s.snapshots)
  const deleteSnapshot = usePagesStore((s) => s.deleteSnapshot)
  const mine = snapshots.filter((s) => s.pageId === pageId)
  const [label, setLabel] = useState('')

  return (
    <Drawer
      title="Time Machine"
      icon={<Camera size={15} />}
      onClose={onClose}
      footer={
        <div className="flex gap-1.5">
          <Input placeholder="Label (optional)" value={label} aria-label="Snapshot label" onChange={(e) => setLabel(e.target.value)} />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              session.takeSnapshot(label.trim())
              setLabel('')
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      {mine.length === 0 ? (
        <p className="px-2 py-6 text-center text-[0.85em] text-ink-faint">
          No snapshots yet. Save one below — or let the auto snapshot take one.
        </p>
      ) : (
        <ul className="space-y-1">
          {mine.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-token-sm border border-line bg-surface/40 p-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[0.88em] font-medium">{s.label}</span>
                  {s.auto && (
                    <span className="rounded-sm bg-sunken px-1 py-0.5 text-[0.62em] font-semibold uppercase text-ink-faint">
                      auto
                    </span>
                  )}
                </div>
                <div className="text-[0.72em] text-ink-faint">
                  {timeAgo(s.takenAt)} · {s.blocks.length} blocks
                </div>
              </div>
              <IconBtn label={`Restore ${s.label}`} onClick={() => session.restoreSnapshot(s.id)}>
                <RotateCcw size={14} />
              </IconBtn>
              <IconBtn label={`Delete ${s.label}`} onClick={() => void deleteSnapshot(s.id)}>
                <Trash2 size={14} />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 px-2 text-[0.72em] leading-relaxed text-ink-faint">
        Snapshots live only in this device’s local store — there is no cloud sync in this build.
      </p>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// Comments drawer — per-block comments with @mentions → Notification Center
// ---------------------------------------------------------------------------

export function CommentsDrawer({
  page,
  blockId,
  onClose
}: {
  page: PageRecord
  blockId: string | null
  onClose: () => void
}) {
  const comments = usePagesStore((s) => s.comments[page.id] ?? [])
  const addComment = usePagesStore((s) => s.addComment)
  const profileName = useSettingsStore((s) => s.profileName)
  const [text, setText] = useState('')
  const mine = comments.filter((c) => c.blockId === blockId)

  return (
    <Drawer title="Comments" icon={<HistoryIcon size={15} />} onClose={onClose}>
      {!blockId ? (
        <p className="px-2 py-6 text-center text-[0.85em] text-ink-faint">Select a block first, then use its “Comments” action.</p>
      ) : (
        <div className="space-y-2">
          {mine.length === 0 && (
            <p className="px-2 py-4 text-center text-[0.82em] text-ink-faint">No comments on this block yet.</p>
          )}
          {mine.map((c) => (
            <div key={c.id} className="rounded-token border border-line bg-surface/40 p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[0.82em] font-semibold text-primary">@{c.author}</span>
                <span className="text-[0.7em] text-ink-faint">{timeAgo(c.at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[0.88em]">{c.text}</p>
              {c.mentions.length > 0 && (
                <div className="mt-1 text-[0.72em] text-info">
                  mentions: {c.mentions.map((m) => `@${m}`).join(', ')}
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <Input
              placeholder={`Comment as ${profileName} — @ to mention`}
              value={text}
              aria-label="New comment"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim()) {
                  void addComment(page.id, blockId, profileName, text.trim())
                  setText('')
                }
              }}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!text.trim()}
              onClick={() => {
                void addComment(page.id, blockId, profileName, text.trim())
                setText('')
              }}
            >
              Post
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
