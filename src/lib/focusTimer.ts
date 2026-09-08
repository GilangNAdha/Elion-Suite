import type { PomodoroConfig } from './types'
import type { ActiveTimer } from '../stores/lockdownStore'

export function remainingMs(timer: ActiveTimer, config: PomodoroConfig, now = Date.now()): number {
  if (timer.running && timer.endsAt != null) return Math.max(0, timer.endsAt - now)
  if (timer.remainingMs != null) return timer.remainingMs
  if (timer.cyclesDone >= config.goalCycles) return 0
  return (timer.phase === 'break' ? config.breakMin : config.workMin) * 60000
}

/** Deadline-based and deterministic, including catch-up after a background tab. */
export function advanceTimer(timer: ActiveTimer, config: PomodoroConfig, now = Date.now()): ActiveTimer {
  let next = { ...timer }
  let guard = 0
  while (next.running && next.endsAt != null && now >= next.endsAt && guard++ < 200) {
    if (next.phase === 'work') {
      next.cyclesDone++
      if (next.cyclesDone >= config.goalCycles)
        return { phase: 'idle', endsAt: null, running: false, cyclesDone: next.cyclesDone, remainingMs: 0 }
      next.phase = 'break'
      next.endsAt += Math.max(1, config.breakMin) * 60000
    } else {
      next.phase = 'work'
      next.endsAt += Math.max(1, config.workMin) * 60000
    }
  }
  return next
}

export function toggleTimer(timer: ActiveTimer, config: PomodoroConfig, now = Date.now()): ActiveTimer {
  if (timer.running)
    return { ...timer, running: false, endsAt: null, remainingMs: remainingMs(timer, config, now) }
  const restart = timer.cyclesDone >= config.goalCycles
  const left = restart ? config.workMin * 60000 : remainingMs(timer, config, now)
  return {
    ...timer,
    phase: timer.phase === 'idle' ? 'work' : timer.phase,
    running: true,
    endsAt: now + left,
    remainingMs: null,
    cyclesDone: restart ? 0 : timer.cyclesDone
  }
}
