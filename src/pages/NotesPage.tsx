import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { NotebookPen, Plus, Pencil, FileText } from 'lucide-react'
import { usePagesStore } from '../stores/pagesStore'
import { Button, EmptyState } from '../components/ui'
import { timeAgo } from '../lib/time'
import { PageView } from './WorkspacePage'

/**
 * Notes — the pinned "personal" branch of the Workspace page tree. Same
 * `pages` store, same block editor (§7): a note edited here (or in a
 * Lockdown widget) is the exact same record.
 */
export function NotesPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)

  const personal = useMemo(
    () =>
      Object.values(pages)
        .filter((p) => p.branch === 'personal')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pages]
  )
  const current = pageId ? pages[pageId] : undefined

  if (current && current.branch === 'personal') {
    return (
      <div>
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className="mb-2 flex items-center gap-2">
            <button
              className="focus-ring text-[0.85em] text-ink-muted hover:text-ink"
              onClick={() => navigate('/notes')}
            >
              ← All notes
            </button>
            <span className="flex-1" />
            <Button size="sm" variant="primary" icon={<Pencil size={13} />} onClick={() => navigate(`/notes/${current.id}/edit`)}>
              Edit
            </Button>
          </div>
        </div>
        <PageView page={current} routePrefix="notes" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[1.7em] font-bold tracking-tight">
            <NotebookPen size={26} className="text-primary" />
            Notes
          </h1>
          <p className="text-[0.88em] text-ink-muted">
            Your personal branch of the Workspace tree — one editor, one store, synced with Lockdown’s notes widget.
          </p>
        </div>
        <span className="flex-1" />
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={async () => {
            const p = await usePagesStore.getState().createPage({ title: 'Untitled note', branch: 'personal' })
            navigate(`/notes/${p.id}/edit`)
          }}
        >
          New note
        </Button>
      </div>

      {personal.length === 0 ? (
        <EmptyState icon={<FileText size={20} />} title="No notes yet" hint="Create your first note." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {personal.map((p) => (
            <button
              key={p.id}
              className="focus-ring elev-raised group rounded-token border border-line bg-raised p-4 text-left transition-transform hover:-translate-y-0.5"
              onClick={() => navigate(`/notes/${p.id}`)}
            >
              <div className="truncate text-[0.98em] font-semibold group-hover:text-primary">{p.title}</div>
              <p className="mt-1 line-clamp-2 h-9 text-[0.8em] leading-5 text-ink-muted">
                {p.blocks
                  .filter((b) => b.parentId === null)
                  .map((b) => b.content)
                  .filter(Boolean)
                  .join(' ')
                  .slice(0, 140) || 'Empty note'}
              </p>
              <div className="mt-2 text-[0.72em] text-ink-faint">{timeAgo(p.updatedAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
