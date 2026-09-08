import { describe, expect, it } from 'vitest'
import { advanceTimer, remainingMs, toggleTimer } from '../src/lib/focusTimer'
import type { ActiveTimer } from '../src/stores/lockdownStore'
const config = { workMin: 25, breakMin: 5, goalCycles: 2 }
const initial: ActiveTimer = {
  phase: 'work',
  endsAt: 25 * 60000,
  running: true,
  cyclesDone: 0,
  remainingMs: null
}

describe('one deadline-based focus timer', () => {
  it('resumes the remaining interval, rather than restarting it', () => {
    const paused = toggleTimer(initial, config, 10000)
    expect(remainingMs(paused, config, 20000)).toBe(25 * 60000 - 10000)
    const resumed = toggleTimer(paused, config, 40000)
    expect(resumed.endsAt).toBe(25 * 60000 + 30000)
    expect(resumed.running).toBe(true)
  })
  it('switches work to break and increments completed cycles exactly once', () => {
    const next = advanceTimer(initial, config, 25 * 60000)
    expect(next).toMatchObject({ phase: 'break', cyclesDone: 1, endsAt: 30 * 60000 })
    expect(advanceTimer(next, config, 25 * 60000)).toEqual(next)
  })
  it('catches up after a throttled/background tab', () => {
    expect(advanceTimer(initial, config, 31 * 60000)).toMatchObject({
      phase: 'work',
      cyclesDone: 1,
      endsAt: 55 * 60000
    })
  })
  it('stops at the goal without starting an extra break', () => {
    const done = advanceTimer(initial, config, 80 * 60000)
    expect(done).toMatchObject({ phase: 'idle', running: false, endsAt: null, cyclesDone: 2, remainingMs: 0 })
    expect(remainingMs(done, config)).toBe(0)
  })
  it('does not advance paused intervals', () => {
    const paused = toggleTimer(initial, config, 10000)
    expect(advanceTimer(paused, config, 100000000)).toEqual(paused)
  })
})
