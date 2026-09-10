import { db } from './db'
import { createSkill } from './agentSkills'
import type { AgentTask } from './agentTasks'

/**
 * Self-improvement (Part VII): ELION mengamati RIWAYAT kerjanya sendiri dan
 * men-distill pola yang terbukti berhasil berulang menjadi skill baru yang
 * bisa dijalankan ulang. Sumber data = tabel agentTasks nyata (completed /
 * failed); tidak ada karangan, tidak ada skill tanpa bukti.
 *
 * Aturan yang dijaga:
 *  - ambang jujur: butuh ≥ MIN_COMPLETIONS run identik yang completed dan
 *    rasio sukses ≥ MIN_SUCCESS_RATIO;
 *  - satu pola = satu skill (nama deterministik dari judul task);
 *  - skill yang user hapus TIDAK dihidupkan ulang (cek event agent.skill.deleted);
 *  - setiap promosi lewat createSkill → recordSkill → event `skill.promoted`,
 *    jadi Skill Ledger selalu punya bukti di belakangnya.
 */

export const MIN_COMPLETIONS = 3
export const MIN_SUCCESS_RATIO = 0.6

const LAST_DISTILL_KEY = 'elion-last-distill'
export const DISTILL_GAP = 6 * 3_600_000

/** JSON stabil (key terurut) — tanda tangan deterministik untuk satu pola kerja. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v === undefined) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

/** Pola kerja = tool + argumen identik. Dua run dengan argumen sama = pola. */
export function taskSignature(tool: string, args: unknown): string {
  return `${tool}::${stableStringify(args ?? {})}`
}

/** Nama skill deterministik dari judul task → "auto: …" (maks 6 kata). */
export function skillNameFromTask(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
  return `auto: ${words.join(' ') || 'repeated task'}`.slice(0, 100)
}

export interface DistillResult {
  /** nama skill yang baru dipromosikan ke Skill Ledger */
  promoted: string[]
  /** pola yang lolos ambang tapi sudah/sengaja tidak dipromosikan */
  skipped: number
}

/** Scan satu kali: riwayat task → skill baru di ledger. Idempoten. */
export async function distillSkills(): Promise<DistillResult> {
  const tasks = await db.agentTasks.toArray()
  const outcomes = tasks.filter((t) => t.status === 'completed' || t.status === 'failed')

  const groups = new Map<string, AgentTask[]>()
  for (const t of outcomes) {
    const sig = taskSignature(t.tool, t.args)
    const rows = groups.get(sig)
    if (rows) rows.push(t)
    else groups.set(sig, [t])
  }

  const existing = await db.agentSkills.toArray()
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()))
  const deletions = (
    await db.agentEvents.where('kind').equals('agent.skill.deleted').toArray()
  ).map((e) => (e.detail ?? '').toLowerCase())

  const promoted: string[] = []
  let skipped = 0

  for (const [sig, rows] of groups) {
    const completed = rows.filter((r) => r.status === 'completed')
    if (completed.length < MIN_COMPLETIONS) {
      skipped++
      continue
    }
    const ratio = completed.length / rows.length
    if (ratio < MIN_SUCCESS_RATIO) {
      skipped++
      continue
    }
    const last = [...completed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const name = skillNameFromTask(last.title)
    if (existingNames.has(name.toLowerCase())) {
      skipped++
      continue
    }
    // User pernah menghapus skill dengan nama ini → hormati, jangan hidupkan ulang.
    if (deletions.some((d) => d.includes(name.toLowerCase()))) {
      skipped++
      continue
    }
    const tool = sig.split('::')[0]
    const skill = await createSkill({
      name,
      description: `Auto-promoted from ${completed.length} identical completed runs via ${tool}.`,
      steps: [{ title: last.title, tool: last.tool, args: last.args }],
      origin: 'agent',
      ledgerOrigin: 'evolve',
      ledgerScore: ratio,
      ledgerEvidence: `${completed.length}/${rows.length} identical runs succeeded via ${tool}`
    })
    promoted.push(skill.name)
    existingNames.add(name.toLowerCase())
  }

  return { promoted, skipped }
}

/**
 * Versi loop: paling sering sekali per DISTILL_GAP, hanya saat runtime nyala.
 * Dipanggil dari fase idle Sentient Mode — "self-improvement" adalah kerja
 * berguna yang sah, bukan meta-cerita.
 */
export async function maybeDistill(): Promise<string[]> {
  if (!db.isOpen()) return []
  let last = 0
  try {
    last = Number(localStorage.getItem(LAST_DISTILL_KEY) ?? 0)
  } catch {
    last = 0
  }
  if (Date.now() - last < DISTILL_GAP) return []
  try {
    const res = await distillSkills()
    try {
      localStorage.setItem(LAST_DISTILL_KEY, String(Date.now()))
    } catch {
      /* storage privat — tetap lanjut, hanya lebih sering scan */
    }
    return res.promoted
  } catch {
    return []
  }
}
