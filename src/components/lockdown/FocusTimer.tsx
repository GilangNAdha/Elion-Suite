import { useEffect, useId, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { LockdownPreset } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { advanceTimer, remainingMs, toggleTimer } from '../../lib/focusTimer'
import { playChime } from '../../lib/audio'
import { Button, IconBtn } from '../ui'

/** Mounted once per session. Hiding/removing a timer widget cannot stop time. */
export function FocusTimerEngine({ preset }: { preset: LockdownPreset }) {
  const config = preset.pomodoro
  useEffect(() => {
    const tick = () => {
      const store = useLockdownStore.getState()
      const previous = store.timer
      const next = advanceTimer(previous, config)
      if (
        next.phase !== previous.phase ||
        next.cyclesDone !== previous.cyclesDone ||
        next.endsAt !== previous.endsAt
      ) {
        store.setTimer(next)
        playChime(next.phase === 'break' ? 'break' : 'transition')
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [config])
  return null
}

export function FocusTimer({
  preset,
  objective = '',
  compact = false
}: {
  preset: LockdownPreset
  objective?: string
  compact?: boolean
}) {
  const timer = useLockdownStore((s) => s.timer)
  const setTimer = useLockdownStore((s) => s.setTimer)
  const [now, setNow] = useState(Date.now())
  const gradientId = `focus-${useId().replace(/:/g, '')}`
  useEffect(() => {
    if (!timer.running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer.running, timer.endsAt])
  const left = Math.ceil(remainingMs(timer, preset.pomodoro, now) / 1000)
  const total = (timer.phase === 'break' ? preset.pomodoro.breakMin : preset.pomodoro.workMin) * 60
  const progress = Math.max(0, Math.min(1, 1 - left / Math.max(1, total)))
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  const display = `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const done = timer.cyclesDone >= preset.pomodoro.goalCycles
  return (
    <section className={`focus-timer ${compact ? 'focus-timer-compact' : ''}`} aria-label="Focus timer">
      <div className="focus-ring-wrap">
        <svg className="focus-progress-ring" viewBox="0 0 360 360" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--current)" />
              <stop offset="100%" stopColor="var(--dusk)" />
            </linearGradient>
          </defs>
          <circle cx="180" cy="180" r="170" stroke="var(--line)" strokeWidth="1" fill="none" />
          <circle
            cx="180"
            cy="180"
            r="170"
            stroke={`url(#${gradientId})`}
            strokeWidth="2"
            fill="none"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={progress * 100}
            strokeLinecap="round"
            transform="rotate(-90 180 180)"
          />
        </svg>
        <div className="focus-timer-content">
          <p className="focus-interval">
            {done
              ? 'Session complete'
              : timer.phase === 'break'
                ? 'A moment to recharge'
                : !timer.running
                  ? 'Take your time'
                  : 'Time for deep work'}
          </p>
          <div
            className={`focus-countdown ${hours > 0 ? 'has-hours' : ''}`}
            role="timer"
            aria-live="off"
            aria-label={`${display} remaining`}
          >
            {display}
          </div>
          {objective && (
            <h1 className="focus-objective" title={objective}>
              {objective}
            </h1>
          )}
          <span className="focus-percentage">
            <span>{Math.round(progress * 100)}%</span> complete
          </span>
        </div>
      </div>
      <div
        className="focus-cycles"
        aria-label={`${timer.cyclesDone} of ${preset.pomodoro.goalCycles} intervals completed`}
      >
        {Array.from({ length: Math.min(preset.pomodoro.goalCycles, 12) }, (_, i) => (
          <i
            key={i}
            className={i < timer.cyclesDone ? 'is-complete' : i === timer.cyclesDone ? 'is-current' : ''}
          />
        ))}
        <span>
          Interval <b>{Math.min(timer.cyclesDone + 1, preset.pomodoro.goalCycles)}</b> of{' '}
          <b>{preset.pomodoro.goalCycles}</b>
        </span>
      </div>
      <div className="focus-timer-controls">
        <Button
          size="sm"
          icon={timer.running ? <Pause size={13} /> : <Play size={13} />}
          onClick={() => setTimer(toggleTimer(useLockdownStore.getState().timer, preset.pomodoro))}
        >
          {timer.running ? 'Pause focus' : done ? 'Start another session' : 'Resume focus'}
        </Button>
        <IconBtn
          label="Reset focus timer"
          onClick={() =>
            setTimer({
              phase: 'work',
              running: false,
              endsAt: null,
              remainingMs: preset.pomodoro.workMin * 60000,
              cyclesDone: 0
            })
          }
        >
          <RotateCcw size={14} />
        </IconBtn>
      </div>
    </section>
  )
}
