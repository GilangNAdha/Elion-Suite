import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  History,
  LayoutGrid,
  Maximize2,
  MoreHorizontal,
  Plus,
  Redo2,
  Search,
  Star,
  Trash2,
  Undo2,
  PanelLeft,
  PenTool,
  Rows3,
  Download,
  ShieldCheck,
  MousePointer2,
  Hand,
  StickyNote,
  Square,
  Pencil,
  Minus,
  Scan
} from 'lucide-react'
import { usePagesStore } from '../stores/pagesStore'
import { useItemsStore } from '../stores/itemsStore'
import { useReducedMotion } from '../lib/useReducedMotion'
import { useToasts, Button, IconBtn, Input, Menu, MenuItem, MenuSep, Modal } from '../components/ui'
import { BlockSuiteSurface, type NativeEditorHandle } from '../components/workspace/BlockSuiteSurface'
import { DictationButton } from '../components/Dictation'
import { PageReveal } from '../components/motion/PageReveal'
import { StarBorder } from '../components/motion/StarBorder'
import type { PageRecord } from '../lib/types'
import { timeAgo } from '../lib/time'

export function StudioWorkspacePage({ immersive = false }: { immersive?: boolean }) {
  const { pageId } = useParams()
  const page = usePagesStore((state) => state.pages[pageId ?? ''])
  const [treeOpen, setTreeOpen] = useState(() => !immersive && window.innerWidth >= 768)
  const [editorReady, setEditorReady] = useState(false)
  const [canvasTool, setCanvasTool] = useState('select')
  const [advancedTools, setAdvancedTools] = useState(false)
  const [outline, setOutline] = useState(false)
  const [versions, setVersions] = useState(false)
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saved')
  const api = useRef<NativeEditorHandle | null>(null)
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const mode = page?.editorMode ?? 'page'
  const create = async (mode: 'page' | 'edgeless' = 'page') => {
    const created = await usePagesStore.getState().createPage({
      title: mode === 'edgeless' ? 'Untitled canvas' : 'Untitled',
      editorMode: mode,
      blocks: []
    })
    navigate(`/workspace/${created.id}`)
  }
  return (
    <div className={`studio-workspace ${immersive ? 'is-immersive' : ''}`}>
      {treeOpen && <WorkspaceLibrary pageId={pageId} onCreate={create} onClose={() => setTreeOpen(false)} />}
      <div className="studio-document-column">
        <header className="studio-document-toolbar">
          {immersive && (
            <IconBtn
              label="Back to workspace"
              onClick={() => navigate(page ? `/workspace/${page.id}` : '/workspace')}
            >
              <ArrowLeft size={16} />
            </IconBtn>
          )}
          <IconBtn
            label={treeOpen ? 'Hide document library' : 'Show document library'}
            onClick={() => setTreeOpen((open) => !open)}
          >
            <PanelLeft size={16} />
          </IconBtn>
          <div className="studio-breadcrumb">
            <Link to="/workspace">Workspace</Link>
            {page && (
              <>
                <ChevronRight size={12} />
                <span title={page.title}>{page.title}</span>
              </>
            )}
          </div>
          <span className="studio-toolbar-spacer" />
          {page ? (
            <>
              <div className="studio-mode-switch" role="tablist" aria-label="Document mode">
                {(
                  [
                    { id: 'page', label: 'Doc', icon: FileText },
                    { id: 'edgeless', label: 'Canvas', icon: PenTool }
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    role="tab"
                    aria-selected={mode === option.id}
                    onClick={() => void usePagesStore.getState().setEditorMode(page.id, option.id)}
                  >
                    {mode === option.id && (
                      <motion.span
                        className="mode-switch-highlight"
                        layoutId="doc-mode-highlight"
                        transition={{ duration: reduced ? 0 : 0.2 }}
                      />
                    )}
                    <option.icon size={13} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              {mode === 'edgeless' && (
                <IconBtn
                  label={advancedTools ? 'Use compact canvas tools' : 'Show all native canvas tools'}
                  active={advancedTools}
                  onClick={() => setAdvancedTools((value) => !value)}
                >
                  <MoreHorizontal size={17} />
                </IconBtn>
              )}
              <DictationButton
                label="Dictate into BlockSuite document"
                getTarget={() => api.current?.editor ?? null}
              />
              <IconBtn label="Undo document change" onClick={() => api.current?.undo()}>
                <Undo2 size={15} />
              </IconBtn>
              <IconBtn label="Redo document change" onClick={() => api.current?.redo()}>
                <Redo2 size={15} />
              </IconBtn>
              <IconBtn
                label={page.favorite ? 'Remove document from favourites' : 'Add document to favourites'}
                active={page.favorite}
                onClick={() => void usePagesStore.getState().toggleFavorite(page.id)}
              >
                <Star size={15} />
              </IconBtn>
              <Menu
                align="end"
                trigger={
                  <IconBtn label="Document actions">
                    <MoreHorizontal size={18} />
                  </IconBtn>
                }
              >
                <MenuItem
                  icon={<Rows3 size={14} />}
                  label={outline ? 'Hide outline' : 'Show outline'}
                  onClick={() => setOutline(!outline)}
                />
                <MenuItem
                  icon={<History size={14} />}
                  label="Version history"
                  onClick={() => setVersions(true)}
                />
                <MenuItem
                  icon={<Download size={14} />}
                  label="Save a version"
                  onClick={() => {
                    void (async () => {
                      await api.current?.flush()
                      await usePagesStore.getState().snapshotNow(page.id, 'Saved version')
                      useToasts.getState().push('Version saved', 'success')
                    })()
                  }}
                />
                <MenuItem
                  icon={<Maximize2 size={14} />}
                  label={immersive ? 'Leave full-screen editor' : 'Edit full-screen'}
                  onClick={() => navigate(`/workspace/${page.id}${immersive ? '' : '/edit'}`)}
                />
                <MenuSep />
                <MenuItem
                  icon={<LayoutGrid size={14} />}
                  label="Open advanced Elion editor"
                  onClick={() => navigate(`/workspace/${page.id}/legacy-edit`)}
                />
              </Menu>
            </>
          ) : (
            <div className="studio-local-status">
              <ShieldCheck size={13} />
              <span>On your device</span>
            </div>
          )}
        </header>
        {page ? (
          <>
            <div className="studio-editor-body" data-native-tools={advancedTools}>
              <BlockSuiteSurface
                key={`${page.id}:${reload}`}
                pageId={page.id}
                mode={mode}
                onReady={(handle) => {
                  api.current = handle
                  setEditorReady(!!handle)
                }}
                onStatus={(next, message) => {
                  setStatus(next)
                  if (next === 'error' && message) useToasts.getState().push(message, 'error')
                }}
              />
              {mode === 'edgeless' && !advancedTools && (
                <div className="studio-canvas-tools" role="toolbar" aria-label="Canvas tools">
                  {(
                    [
                      { id: 'select', label: 'Select', icon: MousePointer2 },
                      { id: 'pan', label: 'Pan', icon: Hand },
                      { id: 'note', label: 'Add note', icon: StickyNote },
                      { id: 'shape', label: 'Draw shape', icon: Square },
                      { id: 'brush', label: 'Draw with pen', icon: Pencil }
                    ] as const
                  ).map((tool) => (
                    <button
                      key={tool.id}
                      aria-label={tool.label}
                      title={tool.label}
                      aria-pressed={canvasTool === tool.id}
                      disabled={!editorReady}
                      onClick={() => {
                        api.current?.setTool(tool.id)
                        setCanvasTool(tool.id)
                      }}
                    >
                      <tool.icon size={18} />
                    </button>
                  ))}
                  <span />
                  <button aria-label="Zoom out canvas" title="Zoom out" onClick={() => api.current?.zoom(-1)}>
                    <Minus size={16} />
                  </button>
                  <button
                    aria-label="Fit canvas to content"
                    title="Fit to content"
                    onClick={() => api.current?.fit()}
                  >
                    <Scan size={17} />
                  </button>
                  <button aria-label="Zoom in canvas" title="Zoom in" onClick={() => api.current?.zoom(1)}>
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {outline && (
                <aside className="studio-outline">
                  <div>
                    <h2>On this page</h2>
                    <IconBtn label="Close outline" onClick={() => setOutline(false)}>
                      <PanelLeft size={13} />
                    </IconBtn>
                  </div>
                  <button onClick={() => api.current?.editor.scrollIntoView({ block: 'start' })}>
                    {page.title}
                  </button>
                  {page.blocks
                    .filter((block) => block.type.startsWith('heading'))
                    .map((block) => (
                      <button
                        key={block.id}
                        onClick={() =>
                          api.current?.editor.std.view
                            .getBlock(block.id)
                            ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
                        }
                      >
                        {block.content || 'Untitled heading'}
                      </button>
                    ))}
                </aside>
              )}
            </div>
            <footer className="studio-document-footer">
              <span className={`document-save-state is-${status}`}>
                {status === 'saved' ? <Check size={12} /> : <span className="save-state-dot" />}
                {status === 'saving'
                  ? 'Saving on this device…'
                  : status === 'error'
                    ? 'Not saved — check device storage'
                    : 'All changes saved'}
              </span>
              <span>
                BlockSuite editor
                <span className="footer-divider" />
                {page.blocks.reduce(
                  (count, block) =>
                    count + (block.content.trim() ? block.content.trim().split(/\s+/).length : 0),
                  0
                )}{' '}
                words
              </span>
            </footer>
          </>
        ) : pageId ? (
          <div className="workspace-not-found">
            <FileText size={30} />
            <h1>Document not found</h1>
            <p>It may have been removed. Choose another document from the library.</p>
            <Button onClick={() => navigate('/workspace')}>Open workspace</Button>
          </div>
        ) : (
          <WorkspaceHome onCreate={create} />
        )}
      </div>
      {versions && page && (
        <WorkspaceVersions
          page={page}
          onClose={() => setVersions(false)}
          onRestore={async (id) => {
            await api.current?.flush()
            await usePagesStore.getState().snapshotNow(page.id, 'Before restoring a version', true)
            await api.current?.dispose(false)
            api.current = null
            await usePagesStore.getState().restoreSnapshot(page.id, id)
            setReload((value) => value + 1)
            setVersions(false)
            useToasts.getState().push('Version restored', 'success')
          }}
        />
      )}
    </div>
  )
}

function WorkspaceLibrary({
  pageId,
  onCreate,
  onClose
}: {
  pageId?: string
  onCreate: (mode?: 'page' | 'edgeless') => Promise<void>
  onClose: () => void
}) {
  const pages = usePagesStore((state) => state.pages)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const documents = Object.values(pages)
    .filter(
      (page) =>
        page.branch === 'workspace' &&
        (filter === 'all' || page.favorite) &&
        page.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <aside className="studio-library" aria-label="Document library">
      <div className="library-heading">
        <span className="library-workspace-icon">
          <BookOpen size={17} />
        </span>
        <strong>My workspace</strong>
        <span className="library-local-dot" title="Local workspace" />
        <IconBtn label="Close document library" className="library-mobile-close" onClick={onClose}>
          <PanelLeft size={15} />
        </IconBtn>
      </div>
      <div className="library-search">
        <Search size={13} />
        <input
          aria-label="Find a document"
          placeholder="Find a document"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>⌕</kbd>
      </div>
      <Link
        className={`library-nav-link ${!pageId && filter === 'all' ? 'is-active' : ''}`}
        to="/workspace"
        onClick={() => setFilter('all')}
      >
        <Rows3 size={15} />
        All docs<span>{Object.values(pages).filter((p) => p.branch === 'workspace').length}</span>
      </Link>
      <button
        className={`library-nav-link ${filter === 'favorites' ? 'is-active' : ''}`}
        onClick={() => setFilter((value) => (value === 'all' ? 'favorites' : 'all'))}
      >
        <Star size={15} />
        Favourites
      </button>
      <div className="library-section-heading">
        <span>{filter === 'favorites' ? 'Favourites' : 'Documents'}</span>
        <IconBtn label="Create document" onClick={() => void onCreate()}>
          <Plus size={14} />
        </IconBtn>
      </div>
      <nav className="library-documents" aria-label="Workspace documents">
        {documents.map((page) => (
          <Link
            to={`/workspace/${page.id}`}
            key={page.id}
            className={`library-document ${page.id === pageId ? 'is-active' : ''}`}
            title={page.title}
            style={{ paddingLeft: page.parentId ? 'var(--space-7)' : undefined }}
          >
            {page.editorMode === 'edgeless' ? (
              <PenTool size={14} />
            ) : page.databaseId || page.blocks.some((block) => block.type === 'database') ? (
              <LayoutGrid size={14} />
            ) : (
              <FileText size={14} />
            )}
            <span>{page.title}</span>
            {page.favorite && <Star size={10} />}
          </Link>
        ))}
      </nav>
      {!documents.length && (
        <p className="library-empty">
          {search
            ? 'No matching documents.'
            : filter === 'favorites'
              ? 'Star a document to keep it close.'
              : 'Your first idea starts with a document.'}
        </p>
      )}
      <button className="library-new-document" onClick={() => void onCreate()}>
        <Plus size={15} />
        New document
      </button>
      <div className="library-bottom-note">
        <ShieldCheck size={13} />
        <span>
          Private by default.
          <br />
          <small>No cloud account needed.</small>
        </span>
      </div>
    </aside>
  )
}

function WorkspaceHome({ onCreate }: { onCreate: (mode?: 'page' | 'edgeless') => Promise<void> }) {
  const pages = usePagesStore((state) => state.pages)
  const [view, setView] = useState<'all' | 'favorites'>('all')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const documents = useMemo(
    () =>
      Object.values(pages)
        .filter(
          (page) =>
            page.branch === 'workspace' &&
            (view === 'all' || page.favorite) &&
            `${page.title} ${page.blocks.map((block) => block.content).join(' ')}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pages, query, view]
  )
  return (
    <PageReveal className="workspace-home">
      <header className="workspace-home-heading">
        <div>
          <div className="workspace-home-label">
            <span className="tiny-orbit-mark" />
            Made for your mind
          </div>
          <h1>A little space. Endless possibilities.</h1>
          <p>Write it down. Draw it out. Make it happen.</p>
        </div>
        <StarBorder onClick={() => void onCreate()}>
          <Plus size={14} />
          New document
        </StarBorder>
      </header>
      <div className="workspace-start-actions">
        <button onClick={() => void onCreate('page')}>
          <span>
            <FileText size={20} />
          </span>
          <div>
            <strong>Start with a thought</strong>
            <small>A blank document, ready for anything.</small>
          </div>
          <Plus size={15} />
        </button>
        <button onClick={() => void onCreate('edgeless')}>
          <span>
            <PenTool size={20} />
          </span>
          <div>
            <strong>Think beyond the page</strong>
            <small>Notes, shapes and connections on a canvas.</small>
          </div>
          <Plus size={15} />
        </button>
      </div>
      <section className="document-index" aria-labelledby="documents-title">
        <div className="document-index-toolbar">
          <div className="document-index-tabs">
            <button id="documents-title" aria-pressed={view === 'all'} onClick={() => setView('all')}>
              All documents{' '}
              <span>{Object.values(pages).filter((page) => page.branch === 'workspace').length}</span>
            </button>
            <button aria-pressed={view === 'favorites'} onClick={() => setView('favorites')}>
              Favourites
            </button>
          </div>
          <label>
            <Search size={14} />
            <input
              aria-label="Search workspace"
              placeholder="Search documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="document-index-labels">
          <span>Name</span>
          <span>Edited</span>
          <span>Type</span>
          <span />
        </div>
        {documents.map((page) => (
          <div className="document-index-row" key={page.id}>
            <Link to={`/workspace/${page.id}`}>
              <span className="document-index-icon">
                {page.editorMode === 'edgeless' ? (
                  <PenTool size={18} />
                ) : page.blocks.some((block) => block.type === 'database') ? (
                  <LayoutGrid size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </span>
              <span>
                <strong>{page.title}</strong>
                <small>
                  {page.blocks.find((block) => block.type === 'paragraph')?.content ||
                    'A space for your next idea.'}
                </small>
              </span>
            </Link>
            <span>{timeAgo(page.updatedAt)}</span>
            <span>
              {page.editorMode === 'edgeless'
                ? 'Canvas'
                : page.blocks.some((block) => block.type === 'database')
                  ? 'Project'
                  : 'Document'}
            </span>
            <Menu
              align="end"
              trigger={
                <IconBtn label={`Actions for ${page.title}`}>
                  <MoreHorizontal size={16} />
                </IconBtn>
              }
            >
              <MenuItem
                label={page.favorite ? 'Remove from favourites' : 'Add to favourites'}
                icon={<Star size={13} />}
                onClick={() => void usePagesStore.getState().toggleFavorite(page.id)}
              />
              <MenuItem
                label="Rename document"
                icon={<FileText size={13} />}
                onClick={() => {
                  const title = window.prompt('Document name', page.title)
                  if (title?.trim()) void usePagesStore.getState().renamePage(page.id, title.trim())
                }}
              />
              <MenuSep />
              <MenuItem
                label="Delete document"
                danger
                icon={<Trash2 size={13} />}
                onClick={() => {
                  if (window.confirm(`Delete “${page.title}” and its sub-pages?`))
                    void usePagesStore.getState().deletePage(page.id)
                }}
              />
            </Menu>
          </div>
        ))}
        {!documents.length && (
          <div className="document-index-empty">
            <FileText size={26} />
            <h2>
              {query
                ? 'No matching documents'
                : view === 'favorites'
                  ? 'Keep your favourite ideas close'
                  : 'Your next idea belongs here'}
            </h2>
            <p>
              {query
                ? 'Try a different name or phrase.'
                : 'Create a document, or open a canvas to start exploring.'}
            </p>
            <Button onClick={() => void onCreate()}>Create document</Button>
          </div>
        )}
      </section>
      <footer className="workspace-home-footer">
        <span>
          <Check size={12} />
          Your work stays on this device
        </span>
        <span>Powered by the BlockSuite editor</span>
      </footer>
    </PageReveal>
  )
}
function WorkspaceVersions({
  page,
  onClose,
  onRestore
}: {
  page: PageRecord
  onClose: () => void
  onRestore: (id: string) => Promise<void>
}) {
  const snapshots = usePagesStore((state) => state.snapshots).filter(
    (snapshot) => snapshot.pageId === page.id
  )
  const [busy, setBusy] = useState(false)
  return (
    <Modal open title="Version history" onClose={onClose}>
      <p className="native-version-explanation">
        The original Elion version is saved before this document is first opened in BlockSuite. New snapshots
        include rich text and canvas state.
      </p>
      <div className="native-version-list">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id}>
            <History size={15} />
            <span>
              <strong>{snapshot.label}</strong>
              <small>
                {new Date(snapshot.takenAt).toLocaleString()} /{' '}
                {snapshot.native ? 'BlockSuite document' : 'Original Elion blocks'}
              </small>
            </span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Restore “${snapshot.label}”? The current content will be replaced.`)) {
                  setBusy(true)
                  void onRestore(snapshot.id).finally(() => setBusy(false))
                }
              }}
            >
              Restore version
            </Button>
          </div>
        ))}
        {!snapshots.length && <p>No saved versions yet. Choose Save a version from Document actions.</p>}
      </div>
    </Modal>
  )
}
