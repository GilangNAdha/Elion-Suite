import { assetUrl } from './lib/assets'
import { useEffect, useState } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './tokens/ThemeProvider'
import { AppShell } from './components/shell/AppShell'
import { CommandPalette, usePaletteActions } from './components/shell/CommandPalette'
import { EditorPage } from './components/editor/EditorPage'
import { LockdownPage } from './pages/LockdownPage'
import { DashboardPage } from './pages/DashboardPage'
import { StudioWorkspacePage } from './pages/StudioWorkspacePage'
import { WorkspacePage, DatabaseRoutePage } from './pages/WorkspacePage'
import { TasksPage } from './pages/TasksPage'
import { HabitsPage } from './pages/HabitsPage'
import { CalendarPage } from './pages/CalendarPage'
import { NotesPage } from './pages/NotesPage'
import { AlarmsPage } from './pages/AlarmsPage'
import { MusicPage } from './pages/MusicPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { useItemsStore } from './stores/itemsStore'
import { usePagesStore } from './stores/pagesStore'
import { useLockdownStore } from './stores/lockdownStore'
import { useNotifyStore } from './stores/notifyStore'
import { useSettingsStore } from './stores/settingsStore'
import { seedIfEmpty } from './lib/seed'
import { DictationBridge } from './components/Dictation'
import { FloatingCompanion } from './components/pet/FloatingCompanion'
import { PetActivity } from './components/pet/PetActivity'
import { MusicPlayerCore } from './components/music/MusicPlayerCore'

/**
 * Renders the global command palette. It must live INSIDE <BrowserRouter>:
 * the palette's actions call useNavigate(), which throws when there is no
 * <Router> ancestor. <App> itself sits ABOVE the router, so computing the
 * actions there used to crash the very first render (blank screen on boot).
 */
function GlobalPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = usePaletteActions(null)
  return <CommandPalette open={open} onClose={onClose} actions={actions} />
}

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

export default function App() {
  const [ready, setReady] = useState(false)
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await seedIfEmpty()
      await Promise.all([
        useItemsStore.getState().init(),
        usePagesStore.getState().init(),
        useLockdownStore.getState().init(),
        useNotifyStore.getState().init()
      ])
      if (!cancelled) {
        useSettingsStore.getState().setReady()
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // global Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // the editor route handles its own palette; don't double-open
        if (/\/(?:legacy-)?edit(?:$|[?#])/.test(window.location.pathname + window.location.hash)) return
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg text-ink">
        <img src={assetUrl('favicon.svg')} alt="Elion" className="h-14 w-14" />
        <div className="text-[0.95em] font-medium">Elion Suite</div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-sunken">
          <div className="loading-bar h-full w-1/3 rounded-full bg-primary" />
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* immersive routes — bypass the app shell entirely (§3) */}
          <Route path="/workspace/:pageId/edit" element={<StudioWorkspacePage immersive />} />
          <Route path="/workspace/:pageId/legacy-edit" element={<EditorPage />} />
          <Route path="/notes/:pageId/edit" element={<EditorPage />} />
          <Route path="/lockdown" element={<LockdownPage />} />

          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/workspace" element={<StudioWorkspacePage />} />
            <Route path="/workspace/:pageId" element={<StudioWorkspacePage />} />
            <Route path="/workspace/items/:dbId" element={<DatabaseRoutePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:pageId" element={<NotesPage />} />
            <Route path="/alarms" element={<AlarmsPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/pet" element={<Navigate to="/settings#companion" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <MusicPlayerCore />
        <PetActivity />
        <FloatingCompanion />
        <DictationBridge />
        <GlobalPalette open={palette} onClose={() => setPalette(false)} />
      </Router>
    </ThemeProvider>
  )
}
