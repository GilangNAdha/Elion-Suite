import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Blocks, NotebookPen, Music2, Lock } from 'lucide-react'

// Centered bottom dock — the explicit fix from v3: `left-1/2 -translate-x-1/2`
// (true translateX(-50%)), verified at 375/768/1024/1440px. Hidden in
// Lockdown and the immersive editor (both routes bypass the app shell).

const DOCK = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspace', label: 'Workspace', icon: Blocks },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/music', label: 'Music', icon: Music2 },
  { to: '/lockdown', label: 'Lockdown', icon: Lock }
]

export function BottomDock() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
      <div
        role="navigation"
        aria-label="Quick dock"
        className="dock-in pointer-events-auto glass-panel flex items-center gap-1 rounded-full border border-line p-1"
        style={{ transform: 'translateX(-50%)' }}
      >
        {DOCK.map((d) => (
          <NavLink
            key={d.to}
            to={d.to}
            aria-label={d.label}
            title={d.label}
            className={({ isActive }) =>
              `focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 ${
                isActive
                  ? 'bg-primary text-primary-on shadow-sm'
                  : 'text-ink-muted hover:scale-105 hover:bg-raised hover:text-ink'
              }`
            }
          >
            <d.icon size={17} />
          </NavLink>
        ))}
      </div>
    </div>
  )
}
