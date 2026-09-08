import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomDock } from './BottomDock'
import { useToasts, Toaster } from '../ui'
import { useAlarmEngine } from '../../lib/alarmEngine'
import { usePetStore } from '../../stores/petStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useLockdownStore } from '../../stores/lockdownStore'
import { scheduleDueDateReminders } from '../../stores/itemsStore'
import { useSettingsStore } from '../../stores/settingsStore'

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('elion-sidebar') === '1')
  const location = useLocation()
  const tickPet = usePetStore((s) => s.tick)

  // One reminder pipeline: due/overdue items + alarms → Notification Center (§7)
  useAlarmEngine()
  const itemsReady = useItemsStore((s) => s.ready)
  useEffect(() => {
    if (!itemsReady) return
    scheduleDueDateReminders(useItemsStore.getState())
    const t = setInterval(() => scheduleDueDateReminders(useItemsStore.getState()), 60000)
    return () => clearInterval(t)
  }, [itemsReady])

  const onToggle = (v: boolean) => {
    setCollapsed(v)
    localStorage.setItem('elion-sidebar', v ? '1' : '0')
  }

  return (
    <div className="app-shell flex h-full min-h-0 bg-bg text-ink">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={onToggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!location.pathname.startsWith('/workspace') && <TopBar />}
        <main
          key={location.pathname}
          id="main-content"
          tabIndex={-1}
          className={`shell-page min-h-0 flex-1 overflow-y-auto ${location.pathname.startsWith('/workspace') ? 'studio-shell-page' : ''}`}
        >
          <Outlet />
        </main>
        {!location.pathname.startsWith('/workspace') && <BottomDock />}
      </div>
      <Toaster />
    </div>
  )
}

export function pageTitle(): string {
  const name = useSettingsStore.getState().profileName
  return name
}
