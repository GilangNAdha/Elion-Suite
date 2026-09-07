import { useEffect } from 'react'
import { db } from './db'
import { useNotifyStore } from '../stores/notifyStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * One reminder pipeline (§7): alarms tick here; due/overdue items are surfaced
 * by itemsStore.scheduleDueDateReminders. Both feed the Notification Center —
 * no per-feature toasts.
 */
export function useAlarmEngine(): void {
  useEffect(() => {
    const tick = async () => {
      const now = new Date()
      const nowISO = now.toISOString()
      const alarms = await db.alarms.where({ enabled: true }).toArray()
      const notify = useNotifyStore.getState()
      for (const a of alarms) {
        const fired = a.lastFired ? new Date(a.lastFired) : null
        const due = new Date(a.at)
        let dueISO: string
        if (a.repeat === 'daily') {
          // next occurrence at or before now
          const today = new Date(now)
          today.setHours(due.getHours(), due.getMinutes(), 0, 0)
          if (today > now) today.setDate(today.getDate() - 1)
          dueISO = today.toISOString()
        } else if (a.repeat === 'weekly') {
          const d = new Date(now)
          d.setHours(due.getHours(), due.getMinutes(), 0, 0)
          while (d.getDay() !== due.getDay() && d > now) d.setDate(d.getDate() - 1)
          dueISO = d.toISOString()
        } else {
          dueISO = a.at
        }
        const dueDate = new Date(dueISO)
        const shouldFire =
          !isNaN(dueDate.getTime()) &&
          dueDate <= now &&
          (!fired || dueISO > a.lastFired!) &&
          now.getTime() - dueDate.getTime() < 5 * 60 * 1000 // fire window: 5 min
        if (shouldFire) {
          await db.alarms.update(a.id, { lastFired: nowISO })
          if (a.repeat === 'none') await db.alarms.update(a.id, { enabled: false })
          void notify.push({ kind: 'alarm', title: `Alarm: ${a.title}`, body: 'Ringing now', link: '/alarms' })
        }
      }
    }
    void tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [])
}

export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    const p = await Notification.requestPermission()
    return p === 'granted'
  } catch {
    return false
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { elion?: unknown }).elion
}

export function desktopGuard(): void {
  // Best-effort distraction guard, §8.2 — in Electron the main process owns
  // the blur timer and nudge; on web we approximate with window blur.
  const elion = (window as unknown as { elion?: { setNudge?: (ms: number, bring: boolean) => void } }).elion
  const g = useSettingsStore.getState().guard
  if (elion?.setNudge) elion.setNudge(g.thresholdMs, g.bringToFront && g.enabled)
}
