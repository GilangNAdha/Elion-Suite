import { db } from './db'
import type { AgentToolCall } from './agentChat'

/**
 * Session persistence (Hermes lineage — state.db/sessions, embedded).
 * Chat agent tidak lagi hilang saat refresh: tiap pesan disimpan Dexie dan
 * sesi terakhir dimuat ulang saat app dibuka. Sesi lama dipangkas (simpan
 * 10 terakhir) biar tabel tetap kecil.
 */

export interface StoredAgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: AgentToolCall[]
  interrupted?: boolean
  at: string
}

export async function appendSessionMessage(
  sessionId: string,
  msg: Omit<StoredAgentMessage, 'sessionId'>
): Promise<void> {
  await db.agentMessages.put({ ...msg, sessionId })
}

export async function loadLatestSession(): Promise<{ sessionId: string; messages: StoredAgentMessage[] }> {
  const last = await db.agentMessages.orderBy('at').reverse().limit(1).first()
  const sessionId = last?.sessionId ?? crypto.randomUUID()
  const rows = (await db.agentMessages.where('sessionId').equals(sessionId).toArray()).sort((a, b) =>
    a.at.localeCompare(b.at)
  )
  return { sessionId, messages: rows.slice(-60) }
}

export async function clearSession(): Promise<string> {
  const sessionId = crypto.randomUUID()
  await pruneSessions(10)
  return sessionId
}

/** Buang sesi penuh yang paling tua; sisakan `keep` sesi. */
export async function pruneSessions(keep = 10): Promise<number> {
  const rows = await db.agentMessages.toArray()
  const bySession = new Map<string, string>() // sessionId → last at
  for (const r of rows) {
    const prev = bySession.get(r.sessionId)
    if (!prev || r.at > prev) bySession.set(r.sessionId, r.at)
  }
  const ordered = [...bySession.entries()].sort((a, b) => b[1].localeCompare(a[1]))
  const stale = ordered.slice(keep).map(([sessionId]) => sessionId)
  for (const sessionId of stale) await db.agentMessages.where('sessionId').equals(sessionId).delete()
  return stale.length
}
