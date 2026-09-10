import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  CornerDownLeft,
  LayoutDashboard,
  Blocks,
  CheckSquare,
  Repeat,
  CalendarDays,
  NotebookPen,
  BellRing,
  Music2,
  UserRound,
  Settings,
  Lock,
  FileText,
  Filter,
  CopyPlus,
  Palette,
  MessageCircle,
  Sparkles
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Kbd } from '../ui'
import { fuzzyScore } from '../../lib/search'
import { usePagesStore } from '../../stores/pagesStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useThemeStore } from '../../stores/themeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCompanionStore } from '../../stores/companionStore'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  keywords?: string
  perform: () => void
}

export function usePaletteActions(
  editorContext?: {
    insertBlock: (type: string) => void
    snapshotNow: () => void
  } | null
): PaletteAction[] {
  const navigate = useNavigate()
  const pages = usePagesStore((s) => s.pages)
  const filters = usePagesStore((s) => s.savedFilters)
  const templates = usePagesStore((s) => s.templates)
  const databases = useItemsStore((s) => s.databases)
  const presets = useThemeStore((s) => s.presets)
  const applyPreset = useThemeStore((s) => s.applyPreset)
  const profileName = useSettingsStore((s) => s.profileName)

  return useMemo(() => {
    const nav: PaletteAction[] = [
      {
        id: 'nav-dash',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard size={15} />,
        perform: () => navigate('/')
      },
      {
        id: 'nav-ws',
        label: 'Go to Workspace',
        icon: <Blocks size={15} />,
        perform: () => navigate('/workspace')
      },
      {
        id: 'nav-tasks',
        label: 'Go to Tasks',
        icon: <CheckSquare size={15} />,
        perform: () => navigate('/tasks')
      },
      {
        id: 'nav-habits',
        label: 'Go to Habits',
        icon: <Repeat size={15} />,
        perform: () => navigate('/habits')
      },
      {
        id: 'nav-cal',
        label: 'Go to Calendar',
        icon: <CalendarDays size={15} />,
        perform: () => navigate('/calendar')
      },
      {
        id: 'nav-notes',
        label: 'Go to Notes',
        icon: <NotebookPen size={15} />,
        perform: () => navigate('/notes')
      },
      {
        id: 'nav-alarms',
        label: 'Go to Alarms',
        icon: <BellRing size={15} />,
        perform: () => navigate('/alarms')
      },
      {
        id: 'nav-music',
        label: 'Go to Music',
        icon: <Music2 size={15} />,
        perform: () => navigate('/music')
      },
      {
        id: 'nav-profile',
        label: 'Go to Profile',
        icon: <UserRound size={15} />,
        perform: () => navigate('/profile')
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        icon: <Settings size={15} />,
        perform: () => navigate('/settings')
      },
      {
        id: 'chat-elion',
        label: 'Chat with Elion',
        hint: 'Companion panel',
        icon: <MessageCircle size={15} />,
        keywords: 'elion assistant ai friend talk ask plan',
        perform: () => useCompanionStore.getState().setOpen(true)
      },
      {
        id: 'nav-elion',
        label: 'Open ELION agent chat',
        hint: 'Monitor · chat · jobs',
        icon: <Sparkles size={15} />,
        keywords: 'elion agent sentient autonomous tools chat',
        perform: () => navigate('/agent?tab=chat')
      },
      {
        id: 'nav-lockdown',
        label: 'Start Lockdown',
        hint: 'Full-screen focus',
        icon: <Lock size={15} />,
        perform: () => navigate('/lockdown')
      }
    ]

    const pageActions: PaletteAction[] = Object.values(pages)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 10)
      .map((p) => ({
        id: `page-${p.id}`,
        label: `Open: ${p.title}`,
        hint: p.branch === 'personal' ? 'Note' : 'Page',
        icon: <FileText size={15} />,
        perform: () => navigate(p.branch === 'personal' ? `/notes/${p.id}` : `/workspace/${p.id}`)
      }))

    const filterActions: PaletteAction[] = filters.map((f) => ({
      id: `filter-${f.id}`,
      label: `Run filter: ${f.name}`,
      icon: <Filter size={15} />,
      perform: () =>
        navigate(f.databaseId ? `/workspace/items/${f.databaseId}?filter=${f.id}` : '/tasks?filter=' + f.id)
    }))

    const dbActions: PaletteAction[] = Object.values(databases).map((d) => ({
      id: `db-${d.id}`,
      label: `Open database: ${d.name}`,
      icon: <Blocks size={15} />,
      perform: () => navigate(`/workspace/items/${d.id}`)
    }))

    const templateActions: PaletteAction[] = Object.values(templates).map((t) => ({
      id: `tpl-${t.id}`,
      label: `Apply template: ${t.name}`,
      icon: <CopyPlus size={15} />,
      perform: () => {
        void usePagesStore.getState().applyTemplate(t.id)
      }
    }))

    const themeActions: PaletteAction[] = presets.map((p) => ({
      id: `theme-${p.id}`,
      label: `Theme: ${p.name}`,
      icon: <Palette size={15} />,
      perform: () => applyPreset(p.id)
    }))

    const editorActions: PaletteAction[] = editorContext
      ? ([
          {
            id: 'e-snap',
            label: 'Take version snapshot',
            hint: 'Time Machine',
            icon: <CornerDownLeft size={15} />,
            perform: () => editorContext.snapshotNow()
          },
          ...(
            [
              'heading1',
              'heading2',
              'paragraph',
              'todo',
              'code',
              'quote',
              'callout',
              'divider',
              'image',
              'columns'
            ] as const
          ).map((bt) => ({
            id: `e-insert-${bt}`,
            label: `Insert block: ${bt}`,
            icon: <FileText size={15} />,
            perform: () => editorContext.insertBlock(bt)
          }))
        ] as PaletteAction[])
      : []

    return [
      ...nav,
      ...pageActions,
      ...filterActions,
      ...dbActions,
      ...templateActions,
      ...themeActions,
      ...editorActions
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, filters, templates, databases, presets, editorContext, profileName, navigate, applyPreset])
}

export function CommandPalette({
  open,
  onClose,
  actions
}: {
  open: boolean
  onClose: () => void
  actions: PaletteAction[]
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const ranked = useMemo(() => {
    if (!query.trim()) return actions.slice(0, 14)
    return actions
      .map((a) => ({ a, s: fuzzyScore(query, `${a.label} ${a.hint ?? ''} ${a.keywords ?? ''}`) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 14)
      .map((x) => x.a)
  }, [query, actions])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={onClose} aria-hidden />
      <div
        className="elev-overlay relative h-fit w-full max-w-lg rounded-token-lg border border-line bg-raised"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(ranked.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                ranked[index]?.perform()
                onClose()
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
            placeholder="Type a command or search…"
            aria-label="Command palette input"
            className="h-11 w-full bg-transparent text-[0.95em] outline-none placeholder:text-ink-faint"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {ranked.length === 0 && (
            <div className="px-3 py-6 text-center text-[0.85em] text-ink-faint">Nothing matches</div>
          )}
          {ranked.map((a, i) => (
            <button
              key={a.id}
              className={`focus-ring flex w-full items-center gap-2.5 rounded-token-sm px-2.5 py-2 text-left text-[0.92em] ${
                i === index ? 'bg-primary-soft text-primary' : 'text-ink'
              }`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                a.perform()
                onClose()
              }}
            >
              <span className={i === index ? '' : 'text-ink-muted'}>{a.icon}</span>
              <span className="flex-1 truncate">{a.label}</span>
              {a.hint && <span className="text-[0.75em] text-ink-faint">{a.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
