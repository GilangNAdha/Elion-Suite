import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import {
  buildMemoryContext,
  consolidate,
  extractCandidates,
  forget,
  forgetAll,
  forgetType,
  listMemories,
  recall,
  reinforce,
  remember
} from '../src/lib/memory'
import { useActivityFeed, logActivity } from '../src/lib/activity'

describe('persistent memory engine (§3–§8)', () => {
  beforeEach(async () => {
    await db.memories.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [] })
  })

  it('survives an app restart — DB is the source of truth', async () => {
    await remember({ type: 'user', content: 'Prefers deadline-first weekly plans', source: 'explicit-user', factKey: 'user:planning' })
    // "restart" = semua state React hilang; db tetap ada; read ulang murni dari DB
    const hits = await recall('how should I plan my week', { types: ['user'] })
    expect(hits.map((h) => h.content)).toContain('Prefers deadline-first weekly plans')
  })

  it('recall is contextual — irrelevant memories stay out', async () => {
    await remember({ type: 'preference', content: 'Use ISO dates in tables', factKey: 'pref:dates', source: 'explicit-user' })
    await remember({ type: 'preference', content: 'Favorite pasta is cacio e pepe', factKey: 'pref:pasta', source: 'explicit-user' })
    const hits = await recall('date format in my tables please')
    expect(hits.some((h) => h.factKey === 'pref:dates')).toBe(true)
    expect(hits.some((h) => h.factKey === 'pref:pasta')).toBe(false)
  })

  it('same factKey: explicit user correction wins over stale inference; loser archived with history', async () => {
    const old = await remember({ type: 'preference', content: 'User likes tabs', factKey: 'pref:indent', source: 'inference' })
    const fresh = await remember({ type: 'preference', content: 'User likes 2 spaces', factKey: 'pref:indent', source: 'explicit-user' })
    expect(fresh.retention).toBe('active')
    const archived = await db.memories.get(old.id)
    expect(archived?.retention).toBe('archived')
    expect(archived?.supersededBy).toBe(fresh.id)
    // sebaliknya: inferensi baru TIDAK menggulingkan koreksi eksplisit user
    const notSwapped = await remember({ type: 'preference', content: 'maybe tabs?', factKey: 'pref:indent', source: 'inference' })
    expect(notSwapped.id).toBe(fresh.id)
  })

  it('repeated identical observation reinforces instead of duplicating', async () => {
    await remember({ type: 'preference', content: 'Reply in short bullets', factKey: 'pref:bullets', source: 'explicit-user' })
    const second = await remember({ type: 'preference', content: 'Reply in short bullets', factKey: 'pref:bullets', source: 'explicit-user' })
    expect(second.evidenceCount).toBe(2)
    expect(second.confidence).toBeGreaterThan(0.6)
    expect((await listMemories({ limit: 50 })).filter((m) => m.factKey === 'pref:bullets')).toHaveLength(1)
  })

  it('reinforce on use raises access stats, capped', async () => {
    const m = await remember({ type: 'user', content: 'Gilang', factKey: 'name', source: 'explicit-user', confidence: 0.93 })
    await reinforce([m.id])
    const after = await db.memories.get(m.id)
    expect(after?.accessCount).toBe(1)
    expect(after!.confidence).toBeLessThanOrEqual(0.95)
  })

  it('user can delete one, a category, or everything', async () => {
    await remember({ type: 'preference', content: 'one', factKey: 'x:1' })
    await remember({ type: 'preference', content: 'two', factKey: 'x:2' })
    await remember({ type: 'entity', content: 'Project Aurora repo', factKey: 'e:aurora' })
    const one = await db.memories.where('factKey').equals('x:1').first()
    await forget(one!.id)
    expect(await db.memories.count()).toBe(2)
    await forgetType('preference')
    expect(await db.memories.count()).toBe(1)
    await forgetAll()
    expect(await db.memories.count()).toBe(0)
  })

  it('consolidation abstracts repeated similar episodes into one semantic memory', async () => {
    for (const project of ['Aurora', 'Beacon', 'Cinder'])
      await remember({
        type: 'episodic',
        content: `Organized ${project} project docs into Documents Assets Tasks Archive folders`,
        source: 'tool'
      })
    const created = await consolidate()
    expect(created?.type).toBe('semantic')
    const active = await listMemories({})
    expect(active.filter((m) => m.type === 'semantic')).toHaveLength(1)
    expect(active.filter((m) => m.type === 'episodic')).toHaveLength(0) // diarsipkan, riwayat utuh
  })

  it('extracts preference candidates conservatively — English and Bahasa', () => {
    const en = extractCandidates('I prefer working in the morning, call me Gilang')
    expect(en.some((c) => c.content.includes('working in the morning'))).toBe(true)
    expect(en.some((c) => c.type === 'user' && c.content.includes('Gilang'))).toBe(true)
    const id = extractCandidates('selalu pakai format tanggal ISO di tabel')
    expect(id.some((c) => /ISO/i.test(c.content))).toBe(true)
    // kalimat netral tidak boleh jadi memori
    expect(extractCandidates('what is 2+2?')).toHaveLength(0)
  })

  it('buildMemoryContext labels records as data, not instructions (§11)', async () => {
    await remember({ type: 'preference', content: 'Use semicolons', factKey: 'p:syn', source: 'explicit-user' })
    const { block, ids } = await buildMemoryContext('should I use semicolons in comments')
    expect(block).toContain('not instructions')
    expect(block).toContain('Use semicolons')
    expect(ids).toHaveLength(1)
    const empty = await buildMemoryContext('totally unrelated zzz qqq')
    expect(empty.block).toBe('')
  })

  it('every memory op leaves a REAL activity event (§35–§38)', async () => {
    await remember({ type: 'user', content: 'Likes tables', factKey: 'u:tables', source: 'explicit-user' })
    await logActivity('task.completed', { taskId: 't9', detail: 'demo' })
    const rows = await db.agentEvents.toArray()
    expect(rows.map((r) => r.kind)).toEqual(expect.arrayContaining(['memory.created', 'task.completed']))
    expect(useActivityFeed.getState().events.some((e) => e.taskId === 't9')).toBe(true)
  })
})
