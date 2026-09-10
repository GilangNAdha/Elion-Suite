import { assetUrl } from '../../lib/assets'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Blocks,
  CheckSquare,
  Repeat,
  CalendarDays,
  NotebookPen,
  BellRing,
  Music2,
  Lock,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  HardDrive,
  Sparkles,
  Bot
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePagesStore } from '../../stores/pagesStore'

const GROUPS = [
  {
    label: 'Your space',
    links: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/elion', label: 'Elion chat', icon: Sparkles },
      { to: '/agent', label: 'Agent', icon: Bot },
      { to: '/workspace', label: 'Workspace', icon: Blocks },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/notes', label: 'Notes', icon: NotebookPen }
    ]
  },
  {
    label: 'Your rhythm',
    links: [
      { to: '/habits', label: 'Habits', icon: Repeat },
      { to: '/alarms', label: 'Alarms', icon: BellRing },
      { to: '/music', label: 'Music', icon: Music2 }
    ]
  }
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: (v: boolean) => void }) {
  const studio = useLocation().pathname.startsWith('/workspace')
  const name = useSettingsStore((s) => s.profileName)
  const pages = usePagesStore((s) => s.pages)
  const projects = Object.values(pages)
    .filter((p) => p.branch === 'workspace' && p.blocks.some((b) => b.type === 'database'))
    .slice(0, 2)
  return (
    <nav
      aria-label="Primary"
      className={`app-sidebar ${collapsed ? 'is-collapsed' : ''} ${studio ? 'studio-app-rail' : ''}`}
    >
      <NavLink to="/" className="brand-lockup" aria-label="Elion Suite dashboard">
        <img src={assetUrl('favicon.svg')} alt="" />
        <span className="sidebar-label">
          Elion <span className="brand-light">Suite</span>
        </span>
      </NavLink>
      <div className="sidebar-scroll">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label sidebar-label">{group.label}</div>
            {group.links.map((link) => (
              <NavLink
                key={link.to}
                end={link.to === '/'}
                to={link.to}
                title={link.label}
                className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
              >
                <link.icon size={18} strokeWidth={1.6} />
                <span className="sidebar-label">{link.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        {projects.length > 0 && (
          <div className="nav-group project-nav sidebar-label">
            <div className="nav-group-label">Pinned projects</div>
            {projects.map((project) => (
              <NavLink className="project-link" to={`/workspace/${project.id}`} key={project.id}>
                <span className="project-mark" aria-hidden />
                {project.title}
              </NavLink>
            ))}
          </div>
        )}
        <NavLink to="/lockdown" className="sidebar-focus" title="Enter Lockdown">
          <Lock size={18} strokeWidth={1.6} />
          <div className="sidebar-label">
            <strong>Enter Lockdown</strong>
            <span>A little less noise.</span>
          </div>
        </NavLink>
      </div>
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
        >
          <Settings size={18} strokeWidth={1.6} />
          <span className="sidebar-label">Settings</span>
        </NavLink>
        <div className="device-note sidebar-label">
          <HardDrive size={13} /> Stored on this device
        </div>
        <div className="sidebar-person">
          <NavLink
            to="/profile"
            className={({ isActive }) => `profile-link ${isActive ? 'is-active' : ''}`}
            aria-label="Profile and statistics"
          >
            <span className="person-avatar">{name === 'You' ? 'Y' : name.slice(0, 2)}</span>
            <span className="sidebar-label">
              <strong>{name === 'You' ? 'Personal space' : name}</strong>
              <span>Just for you</span>
            </span>
          </NavLink>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => onToggle(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>
    </nav>
  )
}
