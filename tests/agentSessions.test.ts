import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { appendSessionMessage, clearSession, loadLatestSession, pruneSessions } from '../src/lib/agentSessions'

/**
 * Session persistence (Hermes lineage, embedded) — chat selamat dari refresh:
 * pesan tersimpan per sesi, sesi terakhir dimuat ulang, lama dipangkas.
 */

beforeEach(async () => {
  await db.agentMessages.clear()
})

const msg = (sessionId: string, i: number, at: string) => ({
  id: `${sessionId}-${i}`,
  sessionId,
  role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
  content: `msg ${i}`,
  toolCalls: [],
  at
})

describe('session persistence', () => {
  it('starts a fresh session id when the store is empty', async () => {
    const { sessionId, messages } = await loadLatestSession()
    expect(messages).toEqual([])
    expect(sessionId).toBeTruthy()
  })

  it('restores the most recent session in order', async () => {
    await appendSessionMessage('s1', msg('s1', 0, '2026-09-10T08:00:00Z'))
    await appendSessionMessage('s1', msg('s1', 1, '2026-09-10T08:01:00Z'))
    await appendSessionMessage('s2', msg('s2', 0, '2026-09-11T09:00:00Z'))
    const { sessionId, messages } = await loadLatestSession()
    expect(sessionId).toBe('s2')
    expect(messages.map((m) => m.content)).toEqual(['msg 0'])
    await appendSessionMessage('s2', msg('s2', 1, '2026-09-11T09:01:00Z'))
    expect((await loadLatestSession()).messages.map((m) => m.content)).toEqual(['msg 0', 'msg 1'])
  })

  it('upserts by id (final assistant reply overwrites the in-progress save)', async () => {
    await appendSessionMessage('s1', msg('s1', 0, '2026-09-10T08:00:00Z'))
    await appendSessionMessage('s1', { ...msg('s1', 0, '2026-09-10T08:00:00Z'), content: 'final text' })
    const { messages } = await loadLatestSession()
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('final text')
  })

  it('prunes whole old sessions, keeping the newest N', async () => {
    for (let i = 0; i < 12; i++) {
      const sid = `old-${i}`
      await appendSessionMessage(sid, msg(sid, 0, `2026-08-${String(10 + i).padStart(2, '0')}T08:00:00Z`))
    }
    await appendSessionMessage('fresh', msg('fresh', 0, '2026-09-11T08:00:00Z'))
    const removed = await pruneSessions(10)
    expect(removed).toBe(3)
    const left = await db.agentMessages.toArray()
    expect(new Set(left.map((m) => m.sessionId)).has('fresh')).toBe(true)
    expect(new Set(left.map((m) => m.sessionId)).size).toBeLessThanOrEqual(10)
  })

  it('clear() mints a new session id', async () => {
    await appendSessionMessage('s1', msg('s1', 0, '2026-09-10T08:00:00Z'))
    const next = await clearSession()
    expect(next).not.toBe('s1')
    // riwayat lama tetap di DB (prune yang mengelola), sesi baru mulai kosong
    expect((await loadLatestSession()).sessionId).toBe('s1')
  })
})
