import { db } from './db'
import { uid } from './types'
import { logActivity } from './activity'
import { runTool, getTool, type ToolResult } from './tools'
import { recordSkill, type SkillOrigin as LedgerOrigin } from './skills'

/**
 * Executable skill packs (bagian dari agent core bawaan).
 * Skill = urutan langkah tool nyata (masing-masing tetap lewat gerbang
 * permission runTool) yang bisa dijalankan ulang: dari UI, dari chat, atau
 * oleh loop Sentient. Skill BARU bersifat aditif → otonom (aturan Part VII);
 * mengubah skill yang sudah ada lewat review/edit manual di UI.
 */

export type SkillOrigin = 'user' | 'agent'

export interface SkillStep {
  /** judul singkat langkah, untuk riwayat eksekusi */
  title: string
  tool: string
  args: Record<string, unknown>
}

export interface AgentSkill {
  id: string
  name: string
  description?: string
  steps: SkillStep[]
  origin: SkillOrigin
  enabled: boolean
  createdAt: string
  runCount: number
  lastRunAt?: string
  lastStatus?: 'ok' | 'failed' | 'partial'
}

export interface SkillRunStep {
  title: string
  tool: string
  ok: boolean
  output?: string
  error?: string
}

/** Validasi steps: tool harus terdaftar, bentuk harus benar. */
export function validateSteps(steps: unknown): { steps: SkillStep[]; error?: string } {
  if (!Array.isArray(steps) || steps.length === 0) return { steps: [], error: 'a skill needs at least one step' }
  if (steps.length > 12) return { steps: [], error: 'a skill is capped at 12 steps' }
  const out: SkillStep[] = []
  for (const raw of steps) {
    if (!raw || typeof raw !== 'object') return { steps: [], error: 'each step must be an object' }
    const r = raw as Record<string, unknown>
    const tool = typeof r.tool === 'string' ? r.tool : ''
    if (!getTool(tool)) return { steps: [], error: `unknown tool in steps: ${tool || '(empty)'}` }
    const args = (r.args && typeof r.args === 'object' ? r.args : {}) as Record<string, unknown>
    out.push({
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 120) : tool,
      tool,
      args
    })
  }
  return { steps: out }
}

export async function createSkill(input: {
  name: string
  description?: string
  steps: unknown
  origin?: SkillOrigin
  enabled?: boolean
  /** metadata ledger (§13): asal + skor + bukti — default utk agent = authored */
  ledgerOrigin?: LedgerOrigin
  ledgerScore?: number
  ledgerEvidence?: string
}): Promise<AgentSkill> {
  const name = input.name.trim().slice(0, 120)
  if (!name) throw new Error('A skill needs a name.')
  const { steps, error } = validateSteps(input.steps)
  if (error) throw new Error(error)
  const existing = await db.agentSkills.where('name').equals(name).first()
  if (existing) throw new Error(`A skill named “${name}” already exists — edit it instead of duplicating.`)
  const skill: AgentSkill = {
    id: uid(),
    name,
    description: input.description?.trim().slice(0, 300) || undefined,
    steps,
    origin: input.origin ?? 'user',
    enabled: input.enabled ?? true,
    createdAt: new Date().toISOString(),
    runCount: 0
  }
  await db.agentSkills.add(skill)
  await logActivity('agent.skill.created', { detail: `${skill.name} · ${steps.length} step${steps.length === 1 ? '' : 's'}` })
  // Skill yang Elion buat untuk dirinya sendiri masuk ledger permanen (§13).
  if (skill.origin === 'agent') {
    await recordSkill({
      name: skill.name,
      origin: input.ledgerOrigin ?? 'authored',
      score: input.ledgerScore ?? 0.7,
      evidence: input.ledgerEvidence ?? `executable skill (${steps.length} steps)`
    })
  }
  return skill
}

export async function listSkills(): Promise<AgentSkill[]> {
  const rows = await db.agentSkills.toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getSkillByName(name: string): Promise<AgentSkill | undefined> {
  return db.agentSkills.where('name').equals(name).first()
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  await db.agentSkills.update(id, { enabled })
}

export async function deleteSkill(id: string): Promise<void> {
  const skill = await db.agentSkills.get(id)
  await db.agentSkills.delete(id)
  if (skill) await logActivity('agent.skill.deleted', { detail: skill.name })
}

/** Jalankan skill: tiap langkah lewat runTool() yang sama (permission tetap
 * dijaga per tool). Berhenti di langkah gagal kecuali `continueOnError`. */
export async function runSkill(
  idOrName: string,
  opts: { continueOnError?: boolean } = {}
): Promise<{ ok: boolean; skill?: AgentSkill; steps: SkillRunStep[]; error?: string }> {
  const byId = await db.agentSkills.get(idOrName)
  const skill = byId ?? (await getSkillByName(idOrName))
  if (!skill) return { ok: false, steps: [], error: `no skill named “${idOrName}”` }
  if (!skill.enabled) return { ok: false, steps: [], error: `skill “${skill.name}” is disabled` }
  await logActivity('agent.skill.started', { detail: `${skill.name} · ${skill.steps.length} steps` })
  const results: SkillRunStep[] = []
  let ok = true
  for (const step of skill.steps) {
    const result: ToolResult = await runTool(step.tool, step.args)
    results.push({ title: step.title, tool: step.tool, ok: result.ok, output: result.output, error: result.error })
    if (!result.ok) {
      ok = false
      if (!opts.continueOnError) break
    }
  }
  const status: AgentSkill['lastStatus'] = ok ? 'ok' : results.some((r) => r.ok) ? 'partial' : 'failed'
  await db.agentSkills.update(skill.id, { runCount: skill.runCount + 1, lastRunAt: new Date().toISOString(), lastStatus: status })
  await logActivity(ok ? 'agent.skill.completed' : 'agent.skill.failed', {
    detail: `${skill.name} · ${results.filter((r) => r.ok).length}/${results.length} steps ok`
  })
  return { ok, skill, steps: results }
}

