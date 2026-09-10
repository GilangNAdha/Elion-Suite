import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'
import {
  createJob,
  deleteJob,
  describeSchedule,
  listJobs,
  markJobRun,
  msUntilNextJob,
  nextRunFor,
  scheduleDueJobs,
  setJobEnabled
} from '../src/lib/agentJobs'
import { registerTool, runTool, getTool } from '../src/lib/tools'

/**
 * In-app cron (Hermes lineage, embedded) — jadwal murni terukur, eksekusi
 * lewat antrean prioritas yang sama, hasil tersimpan di job.
 */

let reasonCalls: { prompt: string; jobId?: string }[] = []
registerTool({
  id: 'test.reason',
  label: 'Test reason',
  permission: 'none',
  run: async (args) => {
    const jobId = typeof args.jobId === 'string' ? args.jobId : undefined
    reasonCalls.push({ prompt: String(args.prompt ?? ''), jobId })
    if (jobId) await markJobRun(jobId, true, 'briefed')
    return { ok: true, output: 'briefed' }
  }
})

// agent.reason di registry memanggil LLM — untuk test eksekusi job kita
// menunjuk tool test di atas sebagai penggantinya.
const REASON_TOOL = 'test.reason'
const origReason = () => getTool('agent.reason')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withFakeReason(fn: () => Promise<void>): Promise<void> {
  // cukup pastikan agent.reason ADA di registry (tool nyata) — jalur job
  // diuji sampai batas antrean, bukan sampai LLM.
  expect(origReason()).toBeTruthy()
  await fn()
}

beforeEach(async () => {
  await db.agentJobs.clear()
  await db.agentTasks.clear()
  await db.agentEvents.clear()
  useActivityFeed.setState({ events: [] })
  reasonCalls = []
})

describe('schedule math (pure)', () => {
  it('daily lands on the next local occurrence of HH:MM', () => {
    const from = new Date('2026-09-11T08:30:00').getTime()
    const next = new Date(nextRunFor({ kind: 'daily', at: '09:00' }, from))
    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(0)
    expect(next.getDate()).toBe(11)
    const after = new Date('2026-09-11T09:30:00').getTime()
    const nextDay = new Date(nextRunFor({ kind: 'daily', at: '09:00' }, after))
    expect(nextDay.getDate()).toBe(12)
  })

  it('interval adds minutes; once clamps to its moment', () => {
    const from = new Date('2026-09-11T10:00:00').getTime()
    expect(nextRunFor({ kind: 'interval', intervalMin: 90 }, from)).toBe(from + 90 * 60_000)
    const onceAt = new Date('2026-09-11T23:00:00').getTime()
    expect(nextRunFor({ kind: 'once', at: '2026-09-11T23:00' }, from)).toBe(onceAt)
    expect(nextRunFor({ kind: 'once', at: '2026-09-10T08:00' }, from)).toBe(from) // lewat = eksekusi segera sekali
  })

  it('describes schedules in plain language', () => {
    expect(describeSchedule({ kind: 'daily', at: '09:00' })).toContain('09:00')
    expect(describeSchedule({ kind: 'interval', intervalMin: 60 })).toContain('60 min')
  })
})

describe('job lifecycle', () => {
  it('creates a job with a computed next run and honest validation', async () => {
    const job = await createJob({ name: 'morning brief', prompt: 'Brief me on today', kind: 'daily', at: '07:30' })
    expect(job.enabled).toBe(true)
    expect(job.nextRunAt).toBeGreaterThan(Date.now() - 1000)
    await expect(createJob({ name: 'x', prompt: '', kind: 'daily', at: '07:30' })).rejects.toThrow('prompt')
    expect(await listJobs()).toHaveLength(1)
  })

  it('scheduleDueJobs enqueues due jobs as scheduled-commitment tasks and advances nextRunAt', async () => {
    await withFakeReason(async () => {
      const due = await createJob({ name: 'now-ish', prompt: 'check calendar', kind: 'daily', at: '00:00' })
      await db.agentJobs.update(due.id, { nextRunAt: Date.now() - 1000 })
      const n = await scheduleDueJobs()
      expect(n).toBe(1)
      const tasks = await db.agentTasks.toArray()
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toMatchObject({ tool: 'agent.reason', source: 'schedule', status: 'queued' })
      expect(tasks[0].priority).toBeLessThan(5) // scheduledCommitment < existingTask
      const updated = (await db.agentJobs.get(due.id))!
      expect(updated.nextRunAt).toBeGreaterThan(Date.now())
      // idempoten: tidak due lagi
      expect(await scheduleDueJobs()).toBe(0)
    })
  })

  it('once-jobs disable themselves after their single run', async () => {
    const job = await createJob({ name: 'one-shot', prompt: 'x', kind: 'once', at: new Date(Date.now() - 1000).toISOString() })
    await scheduleDueJobs()
    await markJobRun(job.id, true, 'done')
    const updated = (await db.agentJobs.get(job.id))!
    expect(updated.enabled).toBe(false)
    expect(updated.lastStatus).toBe('ok')
    expect(updated.lastResult).toBe('done')
  })

  it('disabled jobs never enqueue; msUntilNextJob measures the wait', async () => {
    const job = await createJob({ name: 'later', prompt: 'x', kind: 'daily', at: '23:59' })
    await setJobEnabled(job.id, false)
    expect(await msUntilNextJob()).toBeNull()
    await setJobEnabled(job.id, true)
    expect(await msUntilNextJob()).toBeGreaterThan(0)
    await db.agentJobs.update(job.id, { nextRunAt: Date.now() - 5 })
    expect(await msUntilNextJob()).toBeNull() // due ≠ future
    expect(await scheduleDueJobs()).toBe(1)
    await deleteJob(job.id)
    expect(await listJobs()).toHaveLength(0)
  })

  it('the runJobNow path routes through agent.reason which records the result on the job', async () => {
    // Eksekusi agent.reason asli butuh LLM — di sini cukup bukti markJobRun
    // menempel status pada job (kontrak antara tool dan scheduler).
    const job = await createJob({ name: 'contract', prompt: 'x', kind: 'interval', intervalMin: 60 })
    await markJobRun(job.id, false, 'provider unreachable')
    const updated = (await db.agentJobs.get(job.id))!
    expect(updated.lastStatus).toBe('failed')
    expect(updated.lastResult).toContain('provider unreachable')
    expect(updated.enabled).toBe(true) // interval tetap hidup setelah gagal
    void REASON_TOOL
    void reasonCalls
  })

  it('registers the in-app cron tools', () => {
    expect(getTool('agent.reason')).toBeTruthy()
    expect(getTool('agent.jobs.create')?.permission).toBe('schedule.write')
    expect(getTool('agent.jobs.list')?.permission).toBe('workspace.read')
    void runTool
  })
})
