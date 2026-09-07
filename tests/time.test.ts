import { describe, expect, it } from 'vitest'
import { streakFor, occursOn, toISODate, addDays, focusTotals, todayISO } from '../src/lib/time'
import type { FocusSession } from '../src/lib/types'

const d = (offset: number) => toISODate(addDays(new Date(), offset))

describe('recurrence & streaks (shared between Habits, Calendar, Dashboard)', () => {
  it('daily occurs every day; weekdays skip weekends', () => {
    expect(occursOn({ freq: 'daily' }, new Date())).toBe(true)
    const sat = addDays(new Date(), 6 - new Date().getDay() || 0)
    // find a saturday and a monday
    let day = new Date()
    while (day.getDay() !== 6) day = addDays(day, 1)
    expect(occursOn({ freq: 'weekdays' }, day)).toBe(false)
    let mon = new Date()
    while (mon.getDay() !== 1) mon = addDays(mon, 1)
    expect(occursOn({ freq: 'weekdays' }, mon)).toBe(true)
    void sat
  })

  it('weekly respects the day list', () => {
    const rule = { freq: 'weekly' as const, days: [1, 3] }
    let day = new Date()
    while (day.getDay() !== 1) day = addDays(day, 1)
    expect(occursOn(rule, day)).toBe(true)
    day = addDays(day, 1) // Tuesday
    expect(occursOn(rule, day)).toBe(false)
  })

  it('streak counts consecutive due days ending today/yesterday', () => {
    const rule = { freq: 'daily' as const }
    const completions = [d(-3), d(-2), d(-1), d(0)]
    expect(streakFor(completions, rule)).toBe(4)
    // gap breaks the streak
    expect(streakFor([d(-4), d(-1), d(0)], rule)).toBe(2)
    // not done today but done yesterday → continues
    expect(streakFor([d(-1)], rule)).toBe(1)
    expect(streakFor([], rule)).toBe(0)
  })
})

describe('focus analytics (Lockdown → Profile mirror)', () => {
  const session = (daysAgo: number, min: number): FocusSession => {
    const start = new Date(Date.now() - daysAgo * 86400000)
    return {
      id: `s${daysAgo}`,
      presetId: 'p',
      presetName: 'Deep Work',
      objective: '',
      start: start.toISOString(),
      end: new Date(start.getTime() + min * 60000).toISOString(),
      interruptions: 0,
      cyclesCompleted: 1
    }
  }

  it('totals time, streaks, and top preset', () => {
    const sessions = [session(2, 60), session(1, 30), session(0, 15)]
    const t = focusTotals(sessions)
    expect(t.totalMs).toBeCloseTo(105 * 60000, 0)
    expect(t.currentStreak).toBe(3)
    expect(t.longestStreak).toBe(3)
    expect(t.topPreset).toBe('Deep Work')
    expect(t.sessionCount).toBe(3)
  })

  it('empty sessions are safe', () => {
    const t = focusTotals([])
    expect(t.totalMs).toBe(0)
    expect(t.currentStreak).toBe(0)
    expect(t.topPreset).toBeNull()
  })

  it('todayISO returns yyyy-mm-dd', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
