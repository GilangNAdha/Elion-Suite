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

  // Pet mood heartbeat (shared with Lockdown pet widget)
  useEffect(() => {
    const compute = () => {
      const s = useItemsStore.getState()
      const overdue = Object.values(s.items).filter((i) => {
        if (!i.dueDate || i.dueDate >= new Date().toISOString().slice(0, 10)) return false
        const db = s.databases[i.databaseId ?? '']
        return !db?.statuses.find((st) => st.id === i.status)?.isDone
      }).length
      const doneToday = new Date().toISOString().slice(0, 10)
      const done = Object.values(s.items).some(
        (i) => i.type === 'habit' && (i.completions ?? []).includes(doneToday)
      )
      tickPet({
        focusActive: !!useLockdownStore.getState().active,
        overdueCount: overdue,
        doneToday: done,
        hour: new Date().getHours()
      })
    }
    compute()
    const t = setInterval(compute, 30000)
    return () => clearInterval(t)
  }, [tickPet])

  const onToggle = (v: boolean) => {
    setCollapsed(v)
    localStorage.setItem('elion-sidebar', v ? '1' : '0')
  }

  return (
    <div className="flex h-full min-h-0 bg-bg text-ink">
      <Sidebar collapsed={collapsed} onToggle={onToggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main key={location.pathname} className="shell-page min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <BottomDock />
      </div>
      <Toaster />
    </div>
  )
}

export function pageTitle(): string {
  const name = useSettingsStore.getState().profileName
  return name
}
