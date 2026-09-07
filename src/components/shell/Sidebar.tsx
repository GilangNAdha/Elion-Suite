import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Blocks,
  CheckSquare,
  Repeat,
  CalendarDays,
  NotebookPen,
  BellRing,
  Music2,
  Sparkles,
  Lock,
  User,
  Settings,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspace', label: 'Workspace', icon: Blocks },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/alarms', label: 'Alarms', icon: BellRing },
  { to: '/music', label: 'Music', icon: Music2 },
  { to: '/pet', label: 'Pet', icon: Sparkles },
  { to: '/lockdown', label: 'Lockdown', icon: Lock, external: true },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function Sidebar({
  collapsed,
  onToggle
}: {
  collapsed: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <nav
      aria-label="Primary"
      className={`glass-panel flex h-full flex-col border-r border-line transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className={`flex h-14 items-center gap-2 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        {!collapsed && (
          <span className="bg-gradient-to-r from-[var(--c1)] to-[var(--c2)] bg-clip-text text-[1.05em] font-semibold tracking-tight text-transparent">
            Elion Suite
          </span>
        )}
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) =>
              `focus-ring group flex items-center gap-2.5 rounded-token-sm px-2.5 py-2 text-[0.92em] transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-ink-muted hover:bg-raised hover:text-ink'
              }`
            }
          >
            <n.icon size={17} className="shrink-0" />
            {!collapsed && <span className="truncate">{n.label}</span>}
          </NavLink>
        ))}
      </div>
      <div className={`border-t border-line p-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="focus-ring flex h-8 w-full items-center justify-center rounded-token-sm text-ink-muted hover:bg-raised hover:text-ink"
          onClick={() => onToggle(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </nav>
  )
}
