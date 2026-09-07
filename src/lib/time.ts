// Date, recurrence, and streak helpers — shared by Habits, Calendar, Lockdown
// analytics and Tasks so the numbers always agree (§7).

export const DAY = 86400000

export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b)
}

export function weekday(d: Date): number {
  return d.getDay()
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return formatDateShort(new Date(iso))
}

// --- Recurrence (habits, §7) -------------------------------------------------

import type { RecurrenceRule } from './types'

export function occursOn(rule: RecurrenceRule | undefined, d: Date): boolean {
  if (!rule) return false
  const dow = d.getDay()
  switch (rule.freq) {
    case 'daily':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekly':
      return (rule.days ?? []).includes(dow)
  }
}

export function recurrenceLabelFull(rule: RecurrenceRule | undefined): string {
  if (!rule) return 'One-off'
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  switch (rule.freq) {
    case 'daily':
      return 'Daily'
    case 'weekdays':
      return 'Weekdays'
    case 'weekly':
      return (rule.days ?? []).map((d) => dayNames[d]).join(', ') || 'Weekly'
  }
}

/** Consecutive-day streak (ending today or yesterday) honoring the rule. */
export function streakFor(completions: string[] | undefined, rule: RecurrenceRule | undefined): number {
  const set = new Set(completions ?? [])
  if (set.size === 0) return 0
  let d = new Date()
  // Streak may continue if today not yet done but yesterday was.
  if (!set.has(toISODate(d))) d = addDays(d, -1)
  let streak = 0
  let guard = 0
  while (guard < 4000) {
    if (occursOn(rule, d) && set.has(toISODate(d))) {
      streak++
      d = addDays(d, -1)
    } else if (occursOn(rule, d)) {
      break
    }
    guard++
  }
  return streak
}

export function doneOn(completions: string[] | undefined, dateISO: string): boolean {
  return (completions ?? []).includes(dateISO)
}

// --- Focus analytics (Lockdown → Profile, §7) --------------------------------

import type { FocusSession } from './types'

export function focusTotals(sessions: FocusSession[]) {
  let totalMs = 0
  const byDay = new Map<string, number>()
  const byPreset = new Map<string, number>()
  for (const s of sessions) {
    const ms = Math.max(0, new Date(s.end).getTime() - new Date(s.start).getTime())
    totalMs += ms
    const day = toISODate(new Date(s.start))
    byDay.set(day, (byDay.get(day) ?? 0) + ms)
    byPreset.set(s.presetName, (byPreset.get(s.presetName) ?? 0) + ms)
  }
  // Current / longest streak of days with ≥1 session
  const days = new Set([...byDay.keys()])
  const streaks = (startFromToday: boolean) => {
    let d = new Date()
    if (startFromToday && !days.has(toISODate(d))) d = addDays(d, -1)
    let n = 0
    let guard = 0
    while (days.has(toISODate(d)) && guard < 4000) {
      n++
      d = addDays(d, -1)
      guard++
    }
    return n
  }
  // longest
  let longest = 0
  let run = 0
  const sorted = [...days].sort()
  let prev: Date | null = null
  for (const iso of sorted) {
    const d = parseISODate(iso)
    run = prev && toISODate(addDays(prev, 1)) === iso ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  const topPreset = [...byPreset.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    totalMs,
    byDay,
    currentStreak: streaks(true),
    longestStreak: longest,
    topPreset: topPreset?.[0] ?? null,
    sessionCount: sessions.length
  }
}

export function minutesLabel(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m`
}
