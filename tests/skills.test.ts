import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'
import { listSkills, recordSkill, SKILL_ORIGIN_LABEL } from '../src/lib/skills'

describe('Skill Ledger (spek v4.3 Part VII + §13)', () => {
  beforeEach(async () => {
    await db.skills.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [] })
  })

  it('starts honestly empty — no seeds, no sample skills', async () => {
    expect(await listSkills()).toEqual([])
  })

  it('recordSkill persists the row AND its backing event as a pair', async () => {
    const rec = await recordSkill({ name: 'summarize-schedule', origin: 'evolve', score: 0.82 })
    expect(rec.name).toBe('summarize-schedule')
    const rows = await listSkills()
    expect(rows).toHaveLength(1)
    const events = await db.agentEvents.where('kind').equals('skill.promoted').toArray()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toContain('summarize-schedule')
  })

  it('clamps the eval score to 0–1 and labels both origins', async () => {
    const hi = await recordSkill({ name: 'a', origin: 'evolve', score: 9 })
    const lo = await recordSkill({ name: 'b', origin: 'gepa-pr', score: -2 })
    expect(hi.score).toBe(1)
    expect(lo.score).toBe(0)
    expect(SKILL_ORIGIN_LABEL.evolve).toContain('/evolve')
    expect(SKILL_ORIGIN_LABEL['gepa-pr']).toContain('GEPA')
  })

  it('lists oldest first — the ledger is permanent and chronological', async () => {
    await recordSkill({ name: 'first', origin: 'evolve', score: 0.7 })
    await recordSkill({ name: 'second', origin: 'gepa-pr', score: 0.9 })
    const rows = await listSkills()
    expect(rows.map((r) => r.name)).toEqual(['first', 'second'])
  })
})
