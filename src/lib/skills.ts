import { db } from './db'
import { uid } from './types'
import { logActivity } from './activity'

/**
 * Skill Ledger — Part VII spek v4.3.
 * Catatan permanen tiap skill yang Elion buat untuk dirinya sendiri.
 * Tahun-tahunnya diaudit: nama · asal · skor eval · tanggal.
 *
 * Aturan §13/Part VIII: ledger HANYA terisi lewat recordSkill() — yang juga
 * menulis event `skill.promoted` — sehingga tiap baris ledger selalu punya
 * event nyata di belakangnya. Tidak ada seed, tidak ada contoh palsu:
 * sebelum mekanisme /evolve atau GEPA-PR terpasang, ledger jujur kosong
 * dan dashboard menampilkan "Not enough data yet".
 */

export type SkillOrigin = 'evolve' | 'gepa-pr' | 'hermes-import' | 'authored'

export const SKILL_ORIGIN_LABEL: Record<SkillOrigin, string> = {
  evolve: '/evolve auto-promotion',
  'gepa-pr': 'GEPA-evolved + PR-reviewed',
  'hermes-import': 'Imported from the Hermes gateway',
  authored: 'Authored executable skill (in-app)'
}

export interface SkillRecord {
  id: string
  name: string
  origin: SkillOrigin
  /** skor eval/confidence 0–1 yang didapat skill ini saat dipromosikan */
  score: number
  /** bukti ringkas (mis. "dua instinct → /evolve", atau nomor PR) */
  evidence?: string
  createdAt: string
}

/** Satu-satunya jalan menulis ledger — selalu berpasangan dengan event. */
export async function recordSkill(input: {
  name: string
  origin: SkillOrigin
  score: number
  evidence?: string
}): Promise<SkillRecord> {
  const rec: SkillRecord = {
    id: uid(),
    name: input.name.slice(0, 120),
    origin: input.origin,
    score: Math.min(1, Math.max(0, input.score)),
    evidence: input.evidence?.slice(0, 200),
    createdAt: new Date().toISOString()
  }
  await db.skills.add(rec)
  await logActivity('skill.promoted', {
    detail: `${rec.name} · ${SKILL_ORIGIN_LABEL[rec.origin]} · ${Math.round(rec.score * 100)}%`
  })
  return rec
}

/** Ledger utuh, terlama dulu — permanen, tidak pernah di-trim. */
export async function listSkills(): Promise<SkillRecord[]> {
  const rows = await db.skills.toArray()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
