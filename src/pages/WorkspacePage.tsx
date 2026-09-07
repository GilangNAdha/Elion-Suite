import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FileText, FolderPlus, Pencil, Trash2, Link2, MessageSquare,
  Database as DbIcon, History
} from 'lucide-react'
import type { Block, PageRecord } from '../lib/types'
import { usePagesStore } from '../stores/pagesStore'
import { useItemsStore } from '../stores/itemsStore'
import { BlockView } from '../components/editor/blocks'
import { DatabaseBlock } from '../components/items/DatabaseBlock'
import { Button, IconBtn, Menu, MenuItem, MenuSep, EmptyState, StatusPill } from '../components/ui'
import { timeAgo } from '../lib/time'
import type { EditorSession } from '../components/editor/useEditorSession'

/**
 * Workspace (§9): page tree + page views. Pages are block documents from the
 * shared `pages` store; Notes is the "personal" branch of the same tree (§7).
 */
export function WorkspacePage() {
  const { pageId } = useParams()
  const pages = usePagesStore((s) => s.pages)
  const navigate = useNavigate()

  const roots = useMemo(
    () =>
      Object.values(pages)
        .filter((p) => p.branch === 'workspace' && p.parentId === null)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [pages]
  )
  const current = pageId ? pages[pageId] : undefined

  if (current && current.branch !== 'workspace') {
    return (
      <div className="p-8">
        <EmptyState
          icon={<FileText size={24} />}
          title="This page lives in Notes"
          hint="Open it from the Notes page."
          action={<Button variant="primary" onClick={() => navigate(`/notes/${current.id}`)}>Go to Notes</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="glass-panel w-60 shrink-0 border-r border-line" aria-label="Workspace pages">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[0.85em] font-semibold uppercase tracking-wider text-ink-faint">Pages</span>
          <IconBtn label="New page" onClick={() => void usePagesStore.getState().createPage({ title: 'Untitled', branch: 'workspace' })}>
            <FolderPlus size={15} />
          </IconBtn>
        </div>
        <div className="px-2 pb-4">
          <ul>
            {roots.map((p) => (
              <TreeNode key={p.id} page={p} current={pageId} depth={0} />
            ))}
          </ul>
          {roots.length === 0 && (
            <p className="px-3 py-6 text-center text-[0.8em] text-ink-faint">No pages yet — create one.</p>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {current ? (
          <PageView page={current} />
        ) : (
          <div className="mx-auto max-w-3xl p-8">
            <div className="mb-6">
              <h2 className="text-[1.6em] font-bold tracking-tight">Workspace</h2>
              <p className="mt-1 text-[0.92em] text-ink-muted">
                Blocks, databases, and projects — one local-first space. Open a page to read it, or edit it full-screen.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.values(pages)
                .filter((p) => p.branch === 'workspace')
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 8)
                .map((p) => (
                  <button
                    key={p.id}
                    className="focus-ring elev-raised rounded-token border border-line bg-raised p-4 text-left transition-transform hover:-translate-y-0.5"
                    onClick={() => navigate(`/workspace/${p.id}`)}
                  >
                    <div className="flex items-center gap-2 text-[0.95em] font-semibold">
                      <FileText size={15} className="text-primary" />
                      {p.title}
                    </div>
                    <div className="mt-1 text-[0.75em] text-ink-faint">
                      {p.blocks.length} blocks · {timeAgo(p.updatedAt)}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function TreeNode({ page, current, depth }: { page: PageRecord; current?: string; depth: number }) {
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)
  const children = Object.values(pages)
    .filter((p) => p.parentId === page.id && p.branch === 'workspace')
    .sort((a, b) => a.title.localeCompare(b.title))
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-token-sm pr-1 transition-colors ${
          current === page.id ? 'bg-primary-soft' : 'hover:bg-surface'
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          className="focus-ring min-w-0 flex-1 truncate rounded px-1.5 py-1.5 text-left text-[0.88em]"
          style={{ color: current === page.id ? 'var(--primary)' : undefined }}
          onClick={() => navigate(`/workspace/${page.id}`)}
        >
          {page.title}
        </button>
        <Menu
          width={170}
          align="end"
          trigger={
            <span className="focus-ring hidden h-6 w-6 shrink-0 items-center justify-center rounded text-ink-faint hover:text-ink group-hover:flex" aria-label={`Actions for ${page.title}`}>
              ⋯
            </span>
          }
        >
          <MenuItem
            icon={<Pencil size={13} />}
            label="Rename"
            onClick={() => {
              const name = window.prompt('Rename page', page.title)
              if (name?.trim()) void usePagesStore.getState().renamePage(page.id, name.trim())
            }}
          />
          <MenuItem
            icon={<FolderPlus size={13} />}
            label="New sub-page"
            onClick={async () => {
              const p = await usePagesStore.getState().createPage({ title: 'Untitled', parentId: page.id, branch: 'workspace' })
              navigate(`/workspace/${p.id}`)
            }}
          />
          <MenuSep />
          <MenuItem
            icon={<Trash2 size={13} />}
            label="Delete"
            danger
            onClick={() => {
              if (window.confirm(`Delete “${page.title}” and its sub-pages?`))
                void usePagesStore.getState().deletePage(page.id)
            }}
          />
        </Menu>
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.id} page={c} current={current} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function PageView({ page, routePrefix = 'workspace' }: { page: PageRecord; routePrefix?: string }) {
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)
  const comments = usePagesStore((s) => s.comments[page.id] ?? [])

  const backlinks = useMemo(() => {
    const needle = `[[${page.title}]]`
    return Object.values(pages).filter((p) => p.id !== page.id && p.blocks.some((b) => b.content.includes(needle)))
  }, [pages, page.id, page.title])

  const adapter: EditorSession = useMemo(
    () =>
      ({
        page,
        blocks: page.blocks,
        focusContent: { current: new Map() },
        history: [],
        historyIndex: 0,
        canUndo: false,
        canRedo: false,
        undo: () => undefined,
        redo: () => undefined,
        jumpTo: () => undefined,
        selection: [],
        setSelection: () => undefined,
        toggleSelection: () => undefined,
        clearSelection: () => undefined,
        focusRequest: null,
        requestFocus: () => undefined,
        commit: () => undefined,
        insertNew: () => 'x',
        convert: () => undefined,
        remove: () => undefined,
        move: () => undefined,
        composeColumns: () => undefined,
        setBlockContent: () => undefined,
        commitTextEdit: () => undefined,
        patchBlock: () => undefined,
        takeSnapshot: () => undefined,
        restoreSnapshot: () => undefined,
        createDatabaseBlock: () => undefined
      }),
    [page]
  )

  const tops = page.blocks.filter((b) => b.parentId === null).sort((a, b) => a.order - b.order)

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-[1.8em] font-bold tracking-tight">{page.title}</h1>
        <Button variant="ghost" size="sm" icon={<History size={14} />} onClick={() => navigate(`/${routePrefix}/${page.id}/edit`)}>
          History
        </Button>
        <Button variant="primary" size="sm" icon={<Pencil size={13} />} onClick={() => navigate(`/${routePrefix}/${page.id}/edit`)}>
          Edit full-screen
        </Button>
      </div>

      <div className="space-y-1">
        {tops.map((b) => (
          <ReadBlock key={b.id} block={b} adapter={adapter} onOpenPage={(id) => navigate(`/workspace/${id}`)} />
        ))}
      </div>

      <div className="mt-10 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[0.8em] font-semibold uppercase tracking-wider text-ink-faint">
            <Link2 size={12} /> Backlinks ({backlinks.length})
          </div>
          {backlinks.length === 0 ? (
            <p className="text-[0.82em] text-ink-faint">
              Nothing links here yet. Use <code className="rounded bg-sunken px-1">[[{page.title}]]</code> in any block.
            </p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((p) => (
                <li key={p.id}>
                  <button
                    className="focus-ring rounded-token-sm px-2 py-1 text-left text-[0.88em] text-primary hover:bg-surface"
                    onClick={() => navigate(`/workspace/${p.id}`)}
                  >
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[0.8em] font-semibold uppercase tracking-wider text-ink-faint">
            <MessageSquare size={12} /> Comments ({comments.length})
          </div>
          {comments.length === 0 ? (
            <p className="text-[0.82em] text-ink-faint">No comments. Add some from the full-screen editor.</p>
          ) : (
            <ul className="space-y-1.5">
              {comments.slice(0, 5).map((c) => (
                <li key={c.id} className="rounded-token-sm bg-surface/50 px-2.5 py-1.5 text-[0.85em]">
                  <span className="font-semibold text-primary">@{c.author}</span> {c.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function ReadBlock({
  block,
  adapter,
  onOpenPage
}: {
  block: Block
  adapter: EditorSession
  onOpenPage: (id: string) => void
}) {
  const pages = usePagesStore((s) => s.pages)
  const isText = ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'quote', 'code', 'callout', 'todo', 'text'].includes(block.type)

  if (block.type === 'database') {
    return (
      <div className="py-2">
        <DatabaseBlock dbId={String(block.props.dbId ?? '')} />
      </div>
    )
  }
  if (isText) {
    return (
      <div className={block.type === 'heading1' ? 'pt-3' : ''}>
        <LinkedText
          content={block.content}
          className={
            block.type === 'heading1'
              ? 'text-[1.6em] font-bold leading-snug tracking-tight'
              : block.type === 'heading2'
                ? 'text-[1.3em] font-semibold'
                : block.type === 'heading3'
                  ? 'text-[1.1em] font-semibold'
                  : block.type === 'quote'
                    ? 'border-l-2 border-primary pl-3 italic'
                    : block.type === 'code'
                      ? 'rounded-token bg-sunken p-3 font-mono text-[0.85em] whitespace-pre-wrap'
                      : block.type === 'callout'
                        ? 'rounded-token border border-warn/30 bg-warn/10 p-3'
                        : block.type === 'todo' && block.checked
                          ? 'line-through opacity-60'
                          : ''
          }
          prefix={
            block.type === 'bullet' ? '• ' : block.type === 'todo' ? (block.checked ? '☑ ' : '☐ ') : undefined
          }
          onOpen={(title) => {
            const p = Object.values(pages).find((x) => x.title === title)
            if (p) onOpenPage(p.id)
          }}
        />
      </div>
    )
  }
  return <BlockView block={block} session={adapter} />
}

function LinkedText({
  content,
  className = '',
  prefix,
  onOpen
}: {
  content: string
  className?: string
  prefix?: string
  onOpen: (title: string) => void
}) {
  const parts = content.split(/(\[\[[^\]]+\]\])/g)
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {prefix}
      {parts.map((p, i) => {
        const m = p.match(/^\[\[([^\]]+)\]\]$/)
        if (!m) return p
        const title = m[1]
        return (
          <button
            key={i}
            className="focus-ring rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            onClick={() => onOpen(title)}
          >
            {title}
          </button>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// /workspace/items/:dbId — standalone database page (search / filter targets)
// ---------------------------------------------------------------------------

export function DatabaseRoutePage() {
  const { dbId = '' } = useParams()
  const navigate = useNavigate()
  const db = useItemsStore((s) => s.databases[dbId])
  const page = useItemsStore((s) => s.databases[dbId]) ? usePagesStore((s) => s.pages[db.pageId]) : undefined
  if (!db) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<DbIcon size={24} />}
          title="Database not found"
          action={<Button variant="primary" onClick={() => navigate('/workspace')}>Back to Workspace</Button>}
        />
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <DbIcon size={18} className="text-primary" />
        <h1 className="text-[1.4em] font-bold tracking-tight">{db.name}</h1>
        <span className="flex-1" />
        {page && (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/workspace/${page.id}`)}>
            Open in page
          </Button>
        )}
      </div>
      <DatabaseBlock dbId={dbId} />
    </div>
  )
}

