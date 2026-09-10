import { describe, expect, it } from 'vitest'
import {
  performanceSummary,
  rollingSuccess,
  taskOutcomes,
  toolReliability,
  weeklySuccess
} from '../src/lib/monitoring'
import type { AgentTask } from '../src/lib/agentTasks'
import type { AgentEventRecord } from '../src/lib/activity'

const NOW = Date.parse('2026-09-11T12:00:00Z')
const DAY = 86_400_000

function task(p: Partial<AgentTask>): AgentTask {
  return {
    id: p.id ?? 't',
    title: p.title ?? 'task',
    args: p.args ?? {},
    tool: p.tool ?? 'agent.reason',
    status: p.status ?? 'completed',
    source: p.source ?? 'autonomous',
    priority: p.priority ?? 2,
    attempts: p.attempts ?? 1,
    maxAttempts: p.maxAttempts ?? 3,
    createdAt: p.createdAt ?? new Date(NOW - 3 * DAY).toISOString(),
    updatedAt: p.updatedAt ?? new Date(NOW - DAY).toISOString(),
    ...p
  } as AgentTask
}

describe('performanceSummary — hanya dari data nyata', () => {
  it('semua null saat belum ada outcome', () => {
    const s = performanceSummary([], NOW)
    expect(s.all.rate).toBeNull()
    expect(s.recent.rate).toBeNull()
    expect(s.improvement.successDelta).toBeNull()
    expect(s.independentRate).toBeNull()
  })

  it('menghitung rate, retry, independen, dan delta mingguan', () => {
    const tasks = [
      task({ id: 'a', status: 'completed', updatedAt: new Date(NOW - DAY).toISOString(), attempts: 1, source: 'autonomous' }),
      task({ id: 'b', status: 'failed', updatedAt: new Date(NOW - 2 * DAY).toISOString(), source: 'user' }),
      task({ id: 'c', status: 'completed', updatedAt: new Date(NOW - 10 * DAY).toISOString(), attempts: 2 }),
      task({ id: 'd', status: 'queued', updatedAt: new Date(NOW - DAY).toISOString() })
    ]
    const s = performanceSummary(tasks, NOW)
    expect(s.all.rate).toBeCloseTo(2 / 3)
    expect(s.all.retryRate).toBeCloseTo(1 / 3)
    // completed = {a (autonomous), c (autonomous)} → semua selesai tanpa campur tangan user
    expect(s.independentRate).toBe(1)
    expect(s.autonomy).toEqual({ user: 0, autonomous: 2, schedule: 0 })
    // recent window (7 hari): a selesai, b gagal → 0.5; previous (7–14 hari): c selesai → 1
    expect(s.recent.rate).toBeCloseTo(0.5)
    expect(s.previous.rate).toBeCloseTo(1)
    expect(s.improvement.successDelta).toBeCloseTo(-0.5)
  })
})

describe('rollingSuccess / weeklySuccess', () => {
  it('rolling kosong bila <2 outcome', () => {
    expect(rollingSuccess([task({})])).toEqual([])
  })
  it('weekly memberi null untuk minggu tanpa data', () => {
    const w = weeklySuccess([], 4, NOW)
    expect(w).toHaveLength(4)
    expect(w.every((x) => x.rate === null)).toBe(true)
  })
})

describe('toolReliability — hanya tool yang benar-benar dipanggil', () => {
  it('mengagregasi tool.completed/failed dari detail', () => {
    const ev: AgentEventRecord[] = [
      { id: '1', at: new Date(NOW).toISOString(), kind: 'tool.completed', detail: 'browser.read — ok', elapsedMs: 500 },
      { id: '2', at: new Date(NOW).toISOString(), kind: 'tool.completed', detail: 'browser.read — ok', elapsedMs: 700 },
      { id: '3', at: new Date(NOW).toISOString(), kind: 'tool.failed', detail: 'email.send — smtp down' }
    ]
    const rows = toolReliability(ev)
    expect(rows).toHaveLength(2)
    const browser = rows.find((r) => r.tool === 'browser.read')!
    expect(browser.rate).toBe(1)
    expect(browser.avgMs).toBe(600)
    const mail = rows.find((r) => r.tool === 'email.send')!
    expect(mail.rate).toBe(0)
  })
  it('kosong bila tidak ada tool event', () => {
    expect(toolReliability([{ id: 'x', at: new Date().toISOString(), kind: 'task.completed' }])).toEqual([])
  })
})

describe('taskOutcomes (existing) tetap konsisten', () => {
  it('null tanpa outcome', () => {
    expect(taskOutcomes([task({ status: 'queued' })])).toBeNull()
  })
})

import { eventHeatmap, eventsInLastHours, avgToolLatency } from '../src/lib/monitoring'
import { render } from '@testing-library/react'
import { ActivityHeatmap, HourBars, TrendLine } from '../src/components/agent/charts'

describe('eventHeatmap / eventsInLastHours — sel dari event nyata', () => {
  it('mengisi sel per hari dan menghitung nol untuk hari kosong', () => {
    const cells = eventHeatmap(
      [
        { id: '1', at: '2026-09-11T02:00:00Z', kind: 'task.completed' },
        { id: '2', at: '2026-09-11T05:00:00Z', kind: 'tool.completed', detail: 'a — b' },
        { id: '3', at: '2026-09-10T09:00:00Z', kind: 'memory.created' }
      ],
      7,
      NOW
    )
    expect(cells).toHaveLength(7)
    expect(cells.find((c) => c.dateISO === '2026-09-11')?.count).toBe(2)
    expect(cells.find((c) => c.dateISO === '2026-09-10')?.count).toBe(1)
    expect(cells[0].count).toBe(0)
  })
  it('eventsInLastHours hanya menghitung jendela itu', () => {
    const ev = [
      { id: 'a', at: new Date(NOW - 30 * 60_000).toISOString(), kind: 'task.completed' },
      { id: 'b', at: new Date(NOW - 3 * 3_600_000).toISOString(), kind: 'task.completed' }
    ]
    expect(eventsInLastHours(ev, 1, NOW)).toBe(1)
    expect(eventsInLastHours(ev, 4, NOW)).toBe(2)
  })
  it('avgToolLatency null tanpa data elapsedMs', () => {
    expect(avgToolLatency([{ id: 'x', at: new Date().toISOString(), kind: 'task.completed' }])).toBeNull()
  })
})

describe('charts — render jujur dari data', () => {
  it('heatmap merender 84 sel + legenda', () => {
    const { container } = render(<ActivityHeatmap cells={eventHeatmap([], 84, NOW)} />)
    expect(container.querySelectorAll('.heat-cell:not(.is-legend)')).toHaveLength(84)
    expect(container.querySelectorAll('.heat-cell.is-legend')).toHaveLength(5)
  })
  it('TrendLine tidak merender apa pun tanpa >=2 titik', () => {
    const { container } = render(<TrendLine points={[0.5]} label="x" />)
    expect(container.querySelector('svg')).toBeNull()
  })
  it('HourBars merender satu bar per bucket', () => {
    const { container } = render(
      <HourBars
        buckets={[
          { hourISO: new Date(NOW - 3_600_000).toISOString(), count: 0 },
          { hourISO: new Date(NOW).toISOString(), count: 3 }
        ]}
        caption="test"
      />
    )
    expect(container.querySelectorAll('.hour-bar')).toHaveLength(2)
  })
})
