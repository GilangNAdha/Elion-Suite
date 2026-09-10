import { describe, expect, it } from 'vitest'
import type { AgentEventRecord } from '../src/lib/activity'
import { PRIORITY, type AgentTask } from '../src/lib/agentTasks'
import type { SkillRecord } from '../src/lib/skills'
import {
  engagedTier,
  growthHeatmap,
  hourlyActions,
  lastSessionStart,
  latencyByCategory,
  memoryOps,
  queueCounts,
  recentErrors,
  rollingLatency,
  rollingSuccess,
  skillCurve,
  stopResumeHistory,
  taskOutcomes,
  velocityByWeek
} from '../src/lib/monitoring'

const evt = (kind: string, at: string, extra: Partial<AgentEventRecord> = {}): AgentEventRecord => ({
  id: `e-${kind}-${at}`,
  at,
  kind,
  ...extra
})

const task = (status: AgentTask['status'], updatedAt: string, extra: Partial<AgentTask> = {}): AgentTask => ({
  id: `t-${status}-${updatedAt}`,
  title: status,
  tool: 'memory.recall',
  args: {},
  status,
  priority: PRIORITY.autonomousWork,
  source: 'autonomous',
  attempts: 0,
  maxAttempts: 3,
  createdAt: updatedAt,
  updatedAt,
  ...extra
})

describe('monitoring derivations (§13 — one data source, pure functions)', () => {
  it('counts the queue by status', () => {
    const counts = queueCounts([
      task('running', '2026-09-10T01:00:00Z'),
      task('paused', '2026-09-10T01:00:00Z'),
      task('completed', '2026-09-10T01:00:00Z'),
      task('interrupted', '2026-09-10T01:00:00Z'),
      task('queued', '2026-09-10T01:00:00Z'),
      task('resumable', '2026-09-10T01:00:00Z'),
      task('failed', '2026-09-10T01:00:00Z')
    ])
    expect(counts).toEqual({ running: 1, paused: 1, completed: 1, interrupted: 1, queued: 2, failed: 1 })
  })

  it('reports the engaged priority tier, or null on an empty queue', () => {
    expect(engagedTier([task('completed', '2026-09-10T01:00:00Z')])).toBeNull()
    const live = engagedTier([
      task('queued', '2026-09-10T01:00:00Z', { priority: PRIORITY.autonomousWork }),
      task('running', '2026-09-10T01:00:00Z', { priority: PRIORITY.userInstruction })
    ])
    expect(live).toEqual({ tier: 1, label: 'User instruction' })
  })

  it('gates success rate on at least one real outcome', () => {
    expect(taskOutcomes([])).toBeNull()
    expect(taskOutcomes([task('queued', '2026-09-10T01:00:00Z')])).toBeNull()
    expect(
      taskOutcomes([task('completed', '2026-09-10T01:00:00Z'), task('failed', '2026-09-10T02:00:00Z')])
    ).toEqual({ completed: 1, failed: 1, rate: 0.5 })
  })

  it('builds a chronological rolling success trend', () => {
    const tasks = [
      task('failed', '2026-09-10T01:00:00Z'),
      task('completed', '2026-09-10T02:00:00Z'),
      task('completed', '2026-09-10T03:00:00Z')
    ]
    expect(rollingSuccess(tasks, 5)).toEqual([0, 0.5, 2 / 3])
    expect(rollingSuccess([task('completed', '2026-09-10T01:00:00Z')])).toEqual([])
  })

  it('derives per-category latency only from events carrying elapsedMs', () => {
    const rows = latencyByCategory([
      evt('tool.completed', '2026-09-10T01:00:00Z', { detail: 'memory.recall', elapsedMs: 100 }),
      evt('tool.completed', '2026-09-10T02:00:00Z', { detail: 'memory.recall', elapsedMs: 300 }),
      evt('tool.completed', '2026-09-10T03:00:00Z', { detail: 'browser.read — ok' }), // legacy: no elapsedMs
      evt('tool.failed', '2026-09-10T04:00:00Z', { detail: 'tasks.create', elapsedMs: 50 }) // failures excluded
    ])
    expect(rows).toEqual([{ category: 'memory', avgMs: 200, samples: 2 }])
  })

  it('builds a chronological rolling latency trend', () => {
    const events = [
      evt('tool.completed', '2026-09-10T01:00:00Z', { detail: 'memory.recall', elapsedMs: 100 }),
      evt('tool.completed', '2026-09-10T02:00:00Z', { detail: 'memory.recall', elapsedMs: 200 })
    ]
    expect(rollingLatency(events, 5)).toEqual([100, 150])
  })

  it('buckets actions per hour without inventing any', () => {
    const now = new Date('2026-09-10T12:30:00Z').getTime()
    const buckets = hourlyActions(
      [task('completed', '2026-09-10T11:10:00Z'), task('failed', '2026-09-10T11:50:00Z')],
      3,
      now
    )
    expect(buckets.map((b) => b.count)).toEqual([0, 2, 0])
  })

  it('counts memory ops from real events, null when none exist', () => {
    expect(memoryOps([])).toBeNull()
    expect(
      memoryOps([
        evt('memory.recalled', '2026-09-10T01:00:00Z'),
        evt('memory.created', '2026-09-10T01:00:00Z'),
        evt('memory.updated', '2026-09-10T01:00:00Z'),
        evt('memory.reinforced', '2026-09-10T01:00:00Z'),
        evt('memory.consolidated', '2026-09-10T01:00:00Z')
      ])
    ).toEqual({ reads: 1, writes: 2, reinforcements: 1 })
  })

  it('surfaces the most recent real errors, newest first', () => {
    const errors = recentErrors(
      [
        evt('task.failed', '2026-09-10T01:00:00Z', { detail: 'first' }),
        evt('tool.completed', '2026-09-10T02:00:00Z'),
        evt('tool.failed', '2026-09-10T03:00:00Z', { detail: 'second' })
      ],
      5
    )
    expect(errors.map((e) => e.text)).toEqual(['second', 'first'])
  })

  it('reads stop/resume history and session start from sentient events', () => {
    const events = [
      evt('sentient.started', '2026-09-10T01:00:00Z'),
      evt('sentient.stopped', '2026-09-10T02:00:00Z'),
      evt('sentient.started', '2026-09-10T03:00:00Z')
    ]
    expect(stopResumeHistory(events).map((h) => h.action)).toEqual(['started', 'stopped', 'started'])
    expect(lastSessionStart(events)).toBe('2026-09-10T03:00:00Z')
    expect(lastSessionStart([])).toBeNull()
    expect(stopResumeHistory([])).toEqual([])
  })

  it('builds the 90-day heatmap only from self-improvement events', () => {
    expect(growthHeatmap([evt('tool.completed', '2026-09-10T01:00:00Z')])).toBeNull()
    const cells = growthHeatmap(
      [
        evt('skill.promoted', '2026-09-09T10:00:00Z'),
        evt('memory.consolidated', '2026-09-09T11:00:00Z'),
        evt('memory.recalled', '2026-09-09T12:00:00Z') // not a learning signal
      ],
      90,
      new Date('2026-09-10T12:00:00Z').getTime()
    )
    expect(cells).not.toBeNull()
    expect(cells).toHaveLength(90)
    expect(cells!.find((c) => c.dateISO === '2026-09-09')?.count).toBe(2)
    expect(cells!.find((c) => c.dateISO === '2026-09-10')?.count).toBe(0)
  })

  it('builds the cumulative skill curve from ledger dates', () => {
    const skills: SkillRecord[] = [
      { id: 'a', name: 'a', origin: 'evolve', score: 0.7, createdAt: '2026-09-08T01:00:00Z' },
      { id: 'b', name: 'b', origin: 'gepa-pr', score: 0.9, createdAt: '2026-09-09T01:00:00Z' }
    ]
    expect(skillCurve([])).toEqual([])
    expect(skillCurve(skills)).toEqual([
      { dateISO: '2026-09-08', total: 1 },
      { dateISO: '2026-09-09', total: 2 }
    ])
  })

  it('splits weekly velocity by origin', () => {
    // 2026-09-10 is a Thursday → week starts Monday 2026-09-07.
    const skills: SkillRecord[] = [
      { id: 'a', name: 'a', origin: 'evolve', score: 0.7, createdAt: '2026-09-08T01:00:00Z' },
      { id: 'b', name: 'b', origin: 'evolve', score: 0.7, createdAt: '2026-09-09T01:00:00Z' },
      { id: 'c', name: 'c', origin: 'gepa-pr', score: 0.9, createdAt: '2026-08-20T01:00:00Z' },
      { id: 'd', name: 'd', origin: 'hermes-import', score: 0.6, createdAt: '2026-09-09T02:00:00Z' }
    ]
    const weeks = velocityByWeek(skills, 8, new Date('2026-09-10T12:00:00Z').getTime())
    expect(weeks).toHaveLength(8)
    const current = weeks.find((w) => w.weekISO === '2026-09-07')
    expect(current).toEqual({ weekISO: '2026-09-07', evolve: 2, gepaPr: 0, hermes: 1 })
    expect(weeks.reduce((n, w) => n + w.evolve + w.gepaPr + w.hermes, 0)).toBe(4)
  })
})
