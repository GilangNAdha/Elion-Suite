import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { logActivity } from '../src/lib/activity'
import {
  DISTILL_GAP,
  MIN_COMPLETIONS,
  distillSkills,
  maybeDistill,
  skillNameFromTask,
  stableStringify,
  taskSignature
} from '../src/lib/selfImprove'
import { listSkills } from '../src/lib/skills'
import { listTools, runTool } from '../src/lib/tools'
import { usePermissionStore } from '../src/lib/permissions'
import type { AgentTask } from '../src/lib/agentTasks'

const NOW = new Date('2026-09-11T08:00:00Z').getTime()

function task(p: Partial<AgentTask>): AgentTask {
  return {
    id: p.id ?? `t${Math.random().toString(36).slice(2, 8)}`,
    title: p.title ?? 'Send the weekly report',
    tool: p.tool ?? 'docs.create',
    args: p.args ?? { title: 'Weekly report', body: 'numbers' },
    status: p.status ?? 'completed',
    priority: p.priority ?? 2,
    source: p.source ?? 'autonomous',
    attempts: p.attempts ?? 1,
    maxAttempts: p.maxAttempts ?? 3,
    createdAt: p.createdAt ?? new Date(NOW - 3_600_000).toISOString(),
    updatedAt: p.updatedAt ?? new Date(NOW - 1_800_000).toISOString(),
    ...p
  }
}

beforeEach(async () => {
  await Promise.all([db.agentTasks.clear(), db.agentSkills.clear(), db.skills.clear(), db.agentEvents.clear()])
  usePermissionStore.setState({ modes: {}, approvals: [], ready: true })
  localStorage.removeItem('elion-last-distill')
})

describe('signature & naming', () => {
  it('signature stabil terhadap urutan key argumen', () => {
    expect(taskSignature('docs.create', { a: 1, b: [2, 3] })).toBe(taskSignature('docs.create', { b: [2, 3], a: 1 }))
    expect(taskSignature('docs.create', { a: 1 })).not.toBe(taskSignature('email.send', { a: 1 }))
  })

  it('nama skill deterministik, prefix auto, dibatasi 6 kata', () => {
    expect(skillNameFromTask('Send the Weekly REPORT to team!')).toBe('auto: send the weekly report to team')
    expect(skillNameFromTask('!!!')).toBe('auto: repeated task')
  })

  it('stableStringify menangani nested', () => {
    expect(stableStringify({ x: { b: 1, a: 2 } })).toBe('{"x":{"a":2,"b":1}}')
  })
})

describe('distillSkills — dari riwayat nyata ke Skill Ledger', () => {
  it('below threshold → tidak ada skill, tidak ada baris ledger', async () => {
    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' })]) // 2 < 3
    const res = await distillSkills()
    expect(res.promoted).toEqual([])
    expect(await db.agentSkills.count()).toBe(0)
    expect(await db.skills.count()).toBe(0)
  })

  it('3 run identik sukses → skill + ledger origin evolve + event skill.promoted', async () => {
    await db.agentTasks.bulkAdd([
      task({ id: '1', updatedAt: new Date(NOW - 9_000).toISOString() }),
      task({ id: '2' }),
      task({ id: '3', updatedAt: new Date(NOW - 1_000).toISOString() })
    ])
    const res = await distillSkills()
    expect(res.promoted).toEqual(['auto: send the weekly report'])

    const skills = await db.agentSkills.toArray()
    expect(skills).toHaveLength(1)
    expect(skills[0].origin).toBe('agent')
    expect(skills[0].steps).toEqual([
      { title: 'Send the weekly report', tool: 'docs.create', args: { title: 'Weekly report', body: 'numbers' } }
    ])

    const ledger = await listSkills()
    expect(ledger).toHaveLength(1)
    expect(ledger[0].origin).toBe('evolve')
    expect(ledger[0].score).toBe(1)

    const evs = await db.agentEvents.where('kind').equals('skill.promoted').toArray()
    expect(evs.length).toBeGreaterThanOrEqual(1)
  })

  it('rasio sukses < 60% → pola tidak layak jadi skill', async () => {
    await db.agentTasks.bulkAdd([
      task({ id: '1', status: 'completed' }),
      task({ id: '2', status: 'completed' }),
      task({ id: '3', status: 'completed' }),
      task({ id: '4', status: 'failed' }),
      task({ id: '5', status: 'failed' })
    ]) // 3/5 = 0.6 → lolos; turunkan jadi 2/5=0.4 dgn 1 tambahan failed
    await db.agentTasks.bulkAdd([task({ id: '6', status: 'failed' })])
    const res = await distillSkills()
    expect(res.promoted).toEqual([])
    expect(res.skipped).toBeGreaterThanOrEqual(1)
  })

  it('idempoten: run kedua tidak menduplikasi', async () => {
    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' }), task({ id: '3' })])
    await distillSkills()
    const res2 = await distillSkills()
    expect(res2.promoted).toEqual([])
    expect(await db.agentSkills.count()).toBe(1)
    expect(await db.skills.count()).toBe(1)
  })

  it('skill yang dihapus user tidak dihidupkan ulang', async () => {
    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' }), task({ id: '3' })])
    await distillSkills()
    const skill = (await db.agentSkills.toArray())[0]
    await db.agentSkills.delete(skill.id)
    await logActivity('agent.skill.deleted', { detail: skill.name })
    const res = await distillSkills()
    expect(res.promoted).toEqual([])
    expect(await db.agentSkills.count()).toBe(0)
  })
})

describe('maybeDistill — gerbang 6 jam untuk loop', () => {
  it('baru saja distill → skip; setelah DISTILL_GAP → jalan lagi', async () => {
    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' }), task({ id: '3' })])
    localStorage.setItem('elion-last-distill', String(Date.now()))
    expect(await maybeDistill()).toEqual([])
    localStorage.setItem('elion-last-distill', String(Date.now() - DISTILL_GAP - 1_000))
    expect(await maybeDistill()).toEqual(['auto: send the weekly report'])
  })

  it('tanpa penanda waktu → langsung jalan', async () => {
    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' }), task({ id: '3' })])
    expect(await maybeDistill()).toHaveLength(1)
  })
})

describe('skills.improve tool — chat agent bisa memicu distil sendiri', () => {
  it('terdaftar di registry dan mempromosikan pola nyata', async () => {
    const ids = listTools().map((t) => t.id)
    expect(ids).toContain('skills.improve')

    await db.agentTasks.bulkAdd([task({ id: '1' }), task({ id: '2' }), task({ id: '3' })])
    const res = await runTool('skills.improve', {})
    expect(res.ok).toBe(true)
    expect(res.output).toContain('auto: send the weekly report')

    // Tanpa pola baru → jujur bilang tidak ada.
    const res2 = await runTool('skills.improve', {})
    expect(res2.ok).toBe(true)
    expect(res2.output).toContain('no new skills promoted')
  })

  it('konstanta ambang tetap jujur', () => {
    expect(MIN_COMPLETIONS).toBe(3)
  })
})
