import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Search, Sparkle, UserRound, ChevronRight, ShieldCheck } from 'lucide-react'
import { IconBtn, Kbd, Menu, MenuItem, MenuLabel, MenuSep } from '../ui'
import { DictationButton } from '../Dictation'
import { NotificationCenter } from './NotificationCenter'
import { useNotifyStore } from '../../stores/notifyStore'
import { useThemeStore } from '../../stores/themeStore'
import { useItemsStore } from '../../stores/itemsStore'
import { usePagesStore } from '../../stores/pagesStore'
import { globalSearch } from '../../lib/search'
import { useSettingsStore } from '../../stores/settingsStore'

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const items = useItemsStore((s) => s.items)
  const databases = useItemsStore((s) => s.databases)
  const pages = usePagesStore((s) => s.pages)
  const filters = usePagesStore((s) => s.savedFilters)
  const unread = useNotifyStore((s) => s.items.filter((n) => !n.read).length)
  const presets = useThemeStore((s) => s.presets)
  const activeTheme = useThemeStore((s) => s.theme)
  const applyPreset = useThemeStore((s) => s.applyPreset)
  const profileName = useSettingsStore((s) => s.profileName)

  // "/" focuses global search (when not editing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const editing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      if (e.key === '/' && !editing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo(
    () =>
      globalSearch(query, {
        items: Object.values(items),
        pages: Object.values(pages),
        filters,
        databases: Object.fromEntries(
          Object.entries(databases).map(([k, v]) => [k, { name: v.name, pageId: v.pageId }])
        )
      }),
    [query, items, pages, filters, databases]
  )

  const seg = location.pathname.split('/')[1]
  const title = seg === '' ? 'Dashboard' : seg.charAt(0).toUpperCase() + seg.slice(1)

  const nextPreset = () => {
    const i = presets.findIndex((p) => p.id === activeTheme.id)
    if (presets.length) applyPreset(presets[(i + 1) % presets.length].id)
  }

  return (
    <header className="app-topbar relative z-30 flex shrink-0 items-center gap-3 border-b border-line">
      <div className="min-w-0 flex-1">
        <div className="topbar-breadcrumb">
          <span>Personal space</span>
          <ChevronRight size={12} />
          <strong>{title}</strong>
        </div>
      </div>

      {/* Global search */}
      <div className="topbar-search relative hidden w-72 sm:block">
        <Search
          size={15}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSearchOpen(true)
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setSearchOpen(false)
          }}
          placeholder="Search your space"
          aria-label="Global search"
          className="focus-ring h-9 w-full rounded-token-sm border border-line bg-surface/60 pl-8 pr-8 text-[0.9em] placeholder:text-ink-faint"
        />
        <DictationButton label="Dictate search" getTarget={() => searchRef.current} />
        <span className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 md:block">
          <Kbd>/</Kbd>
        </span>
        {searchOpen && query.trim() && (
          <div className="elev-overlay absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-token border border-line bg-raised p-1">
            {hits.length === 0 && (
              <div className="px-3 py-4 text-center text-[0.85em] text-ink-faint">No matches</div>
            )}
            {hits.map((h) => (
              <button
                key={`${h.kind}-${h.id}`}
                className="focus-ring flex w-full items-center gap-2 rounded-token-sm px-2.5 py-2 text-left hover:bg-surface"
                onClick={() => {
                  navigate(h.route)
                  setQuery('')
                  searchRef.current?.blur()
                }}
              >
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[0.68em] font-semibold  ${
                    h.kind === 'item'
                      ? 'bg-info/15 text-info'
                      : h.kind === 'page'
                        ? 'bg-ok/15 text-ok'
                        : 'bg-warn/15 text-warn'
                  }`}
                >
                  {h.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.92em]">{h.title}</span>
                  <span className="block truncate text-[0.75em] text-ink-faint">{h.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <IconBtn label="Cycle theme preset" onClick={nextPreset}>
        <Sparkle size={17} />
      </IconBtn>

      {/* Notification center */}
      <div className="relative">
        <button
          aria-label={`Notifications (${unread} unread)`}
          aria-expanded={bellOpen}
          className="focus-ring relative inline-flex h-8 w-8 items-center justify-center rounded-token-sm text-ink-muted hover:bg-raised hover:text-ink"
          onClick={() => setBellOpen((o) => !o)}
        >
          <Bell size={17} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[0.62em] font-bold text-[var(--on-bad)]">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
        {bellOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-80">
            <NotificationCenter onClose={() => setBellOpen(false)} />
          </div>
        )}
      </div>

      {/* Profile */}
      <Menu
        align="end"
        width={200}
        trigger={
          <span
            className="focus-ring ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary"
            aria-label="Profile menu"
          >
            <UserRound size={16} />
          </span>
        }
      >
        <MenuLabel>{profileName}</MenuLabel>
        <MenuItem label="Profile & stats" onClick={() => navigate('/profile')} />
        <MenuItem label="Settings" onClick={() => navigate('/settings')} />
        <MenuSep />
        <MenuItem label="Start Lockdown" onClick={() => navigate('/lockdown')} />
      </Menu>
    </header>
  )
}
