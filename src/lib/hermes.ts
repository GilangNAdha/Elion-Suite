import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { logActivity } from './activity'

/**
 * Hermes bridge (docs/HERMES-SETUP.md) — koneksi Elion ⇄ Hermes Agent
 * (NousResearch/hermes-agent). Hermes dijalankan sendiri di mesin user
 * (`hermes gateway` dengan API server enabled) dan exposes REST lokal:
 *
 *   GET  /health               — liveness, tanpa auth
 *   GET  /v1/skills            — daftar skill Hermes (bearer)
 *   GET  /v1/toolsets          — daftar toolset + status konfigurasi (bearer)
 *   GET  /v1/models            — model discovery (bearer)
 *   POST /v1/chat/completions  — OpenAI-compatible, agent loop server-side;
 *                                `conversation` merangkai context di gateway
 *   GET/POST /api/jobs         — cron unattended Hermes (bearer)
 *
 * Aturan kejujuran yang sama dengan tools.ts (§67/§68): gateway tidak
 * terjangkau = status `offline` yang JUJUR, bukan hasil karangan. Tidak ada
 * seed, tidak ada contoh palsu.
 *
 * Transport: Electron → main-process bridge (bebas CORS); web → fetch
 * langsung (gateway perlu mengizinkan origin browser via API_SERVER_CORS_ORIGINS).
 */

export const HERMES_DEFAULT_BASE = 'http://127.0.0.1:8642'

interface HermesConfig {
  baseUrl: string
  /** API_SERVER_KEY gateway — kosong kalau gateway jalan tanpa auth */
  apiKey: string
  /** nama conversation di sisi gateway, biar context ter-chain per app */
  conversation: string
  set: (patch: Partial<Omit<HermesConfig, 'set'>>) => void
}

export const useHermesStore = create<HermesConfig>()(
  persist(
    (set) => ({
      baseUrl: HERMES_DEFAULT_BASE,
      apiKey: '',
      conversation: 'elion',
      set: (patch) => set(patch)
    }),
    { name: 'elion-hermes' }
  )
)

export function hermesHeaders(apiKey: string): Record<string, string> {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers
}

function hermesUrl(path: string): string {
  const base = useHermesStore.getState().baseUrl.replace(/\/+$/, '')
  const clean = path.replace(/^\/+/, '')
  // base boleh ditulis dengan atau tanpa /v1 — endpoint non-/v1 tetap benar
  const withV1 = /\/v1$/.test(base) && !/^v1\//.test(clean) ? `${base}/${clean}` : `${base.replace(/\/v1$/, '')}/${clean}`
  return withV1
}

/** Satu request HTTP ke gateway; TIDAK melempar error HTTP — pemanggil yang
 * memutuskan arti status (probe 401 = jalan tapi kunci salah, misalnya). */
export async function hermesRequest(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const { apiKey } = useHermesStore.getState()
  const url = hermesUrl(path)
  const method = init.method ?? 'GET'
  const headers = hermesHeaders(apiKey)
  const body = init.body === undefined ? undefined : JSON.stringify(init.body)
  const timeoutMs = init.timeoutMs ?? 20_000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridge = (window as any)?.elion?.ai
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
  try {
    let response: Response
    if (bridge?.request) {
      const raw = await bridge.request({ url, method, headers, body })
      response = new Response(raw.body ?? '', { status: raw.status })
    } else {
      response = await fetch(url, { method, headers, body, signal: ctrl.signal })
    }
    let json: unknown = null
    const text = await response.text()
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null // halaman login/proxy — diperlakukan sebagai response tanpa JSON
      }
    }
    return { ok: response.ok, status: response.status, json }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : ''
    if (name === 'TimeoutError') {
      throw new Error(`Hermes gateway timed out after ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw new Error(
      `Hermes gateway not reachable at ${url} — run \`hermes gateway\` on this machine (see docs/HERMES-SETUP.md).`
    )
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Bentuk data — parser toleran, Hermes rilis cepat (aturan HERMES-SETUP.md:
// bentuk persis bisa bergeser; ambil yang dikenal, diamkan sisanya).
// ---------------------------------------------------------------------------

export interface HermesSkill {
  name: string
  description?: string
  category?: string
}

export function mapHermesSkills(raw: unknown): HermesSkill[] {
  const rows = Array.isArray(raw) ? raw : ((raw as { skills?: unknown[]; data?: unknown[] })?.skills ?? (raw as { data?: unknown[] })?.data) ?? []
  if (!Array.isArray(rows)) return []
  return rows
    .map((row): HermesSkill | null => {
      if (typeof row === 'string') return { name: row }
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const name = r.name ?? r.id ?? r.skill
      if (typeof name !== 'string' || !name) return null
      return {
        name,
        description: typeof r.description === 'string' ? r.description : undefined,
        category: typeof r.category === 'string' ? r.category : undefined
      }
    })
    .filter((s): s is HermesSkill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface HermesToolset {
  name: string
  label?: string
  enabled?: boolean
  configured?: boolean
  tools: string[]
}

export function mapHermesToolsets(raw: unknown): HermesToolset[] {
  const rows = Array.isArray(raw) ? raw : ((raw as { toolsets?: unknown[]; data?: unknown[] })?.toolsets ?? (raw as { data?: unknown[] })?.data) ?? []
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      name: typeof r.name === 'string' ? r.name : '(unnamed)',
      label: typeof r.label === 'string' ? r.label : undefined,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : undefined,
      configured: typeof r.configured === 'boolean' ? r.configured : undefined,
      tools: Array.isArray(r.tools) ? r.tools.filter((t): t is string => typeof t === 'string') : []
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface HermesJob {
  id: string
  name?: string
  prompt?: string
  schedule?: string
  status?: string
  paused?: boolean
}

export function mapHermesJobs(raw: unknown): HermesJob[] {
  const rows = Array.isArray(raw) ? raw : ((raw as { jobs?: unknown[]; data?: unknown[] })?.jobs ?? (raw as { data?: unknown[] })?.data) ?? []
  if (!Array.isArray(rows)) return []
  return rows
    .map((row): HermesJob | null => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const id = r.id ?? r.job_id
      if (typeof id !== 'string' && typeof id !== 'number') return null
      return {
        id: String(id),
        name: typeof r.name === 'string' ? r.name : undefined,
        prompt: typeof r.prompt === 'string' ? r.prompt : undefined,
        schedule: typeof r.schedule === 'string' ? r.schedule : typeof r.cron === 'string' ? r.cron : undefined,
        status: typeof r.status === 'string' ? r.status : undefined,
        paused: r.paused === true || r.status === 'paused'
      }
    })
    .filter((j): j is HermesJob => j !== null)
}

// ---------------------------------------------------------------------------
// Operasi tingkat tinggi
// ---------------------------------------------------------------------------

export interface HermesStatus {
  online: boolean
  /** gateway menjawab TAPI bearer ditolak (kunci salah/kurang) */
  unauthorized: boolean
  skills: HermesSkill[]
  toolsets: HermesToolset[]
  jobs: HermesJob[]
  /** model id default dari /v1/models kalau tersedia */
  model?: string
  error?: string
}

/**
 * Cache ketersediaan — proses build schema tool TIDAK BOLEH menembak jaringan
 * (dipanggil tiap giliran agent); delegasi/job tools hanya ditawarkan kalau
 * probe TERAKHIR menyatakan online (TTL di bawah). Probe terjadi saat UI
 * dibuka, saat user menekan Test, atau saat tool hermes.status dipanggil.
 */
const onlineTTL = 5 * 60_000
const offlineTTL = 15_000
let availability: { at: number; online: boolean } | null = null

export function hermesProbablyOnline(): boolean {
  if (!availability) return false
  const ttl = availability.online ? onlineTTL : offlineTTL
  return availability.online && Date.now() - availability.at < ttl
}

function markAvailability(online: boolean): void {
  const changed = !availability || availability.online !== online
  availability = { at: Date.now(), online }
  // Event hanya saat TRANSISI (online↔offline) — probe tiap mount UI tidak
  // boleh membanjiri timeline (§36: event = peristiwa, bukan heartbeat).
  if (changed) {
    void logActivity('hermes.availability', { detail: online ? 'gateway online' : 'gateway offline/unauthorized' }).catch(
      () => undefined
    )
  }
}

export async function probeHermes(): Promise<HermesStatus> {
  const base: HermesStatus = { online: false, unauthorized: false, skills: [], toolsets: [], jobs: [] }
  try {
    const health = await hermesRequest('health')
    if (!health.ok) {
      markAvailability(false)
      return { ...base, error: `gateway replied ${health.status}` }
    }
    // /health harus JSON object (docs: {"status":"ok"}) — halaman login/proxy
    // yang kebetulan 200 bukan gateway, jangan dikira online.
    if (!health.json || typeof health.json !== 'object' || Array.isArray(health.json)) {
      markAvailability(false)
      return { ...base, error: 'that URL did not answer like a Hermes gateway (non-JSON /health)' }
    }
  } catch (error) {
    markAvailability(false)
    return { ...base, error: error instanceof Error ? error.message : 'gateway unreachable' }
  }
  base.online = true
  markAvailability(true)
  await logActivity('hermes.probe', { detail: 'gateway reachable' })

  // Endpoint ber-auth: 401 = jalan tapi kunci salah — status jujur, bukan offline.
  const authed = await Promise.all([
    hermesRequest('v1/skills').catch(() => ({ ok: false, status: 0, json: null })),
    hermesRequest('v1/toolsets').catch(() => ({ ok: false, status: 0, json: null })),
    hermesRequest('api/jobs').catch(() => ({ ok: false, status: 0, json: null })),
    hermesRequest('v1/models').catch(() => ({ ok: false, status: 0, json: null }))
  ])
  const denied = authed.filter((r) => r.status === 401 || r.status === 403).length
  base.unauthorized = denied >= 2 // mayoritas endpoint menolak → kunci salah
  if (base.unauthorized) {
    markAvailability(false) // delegasi tetap akan 401 — jangan tawarkan dulu
    return { ...base, error: 'gateway is up but rejected the API key (API_SERVER_KEY)' }
  }

  base.skills = mapHermesSkills(authed[0].json)
  base.toolsets = mapHermesToolsets(authed[1].json)
  base.jobs = mapHermesJobs(authed[2].json)
  const models = (authed[3].json as { data?: { id?: unknown }[] })?.data
  const modelId = Array.isArray(models) ? models.find((m) => m && typeof m.id === 'string')?.id : undefined
  if (typeof modelId === 'string') base.model = modelId
  return base
}

/** Delegasi satu instruksi ke agent Hermes (server-side tool loop).
 * `conversation` (default 'elion') membuat gateway merangkai context. */
export async function hermesDelegate(
  input: string,
  opts: { conversation?: string; timeoutMs?: number } = {}
): Promise<string> {
  const { conversation } = useHermesStore.getState()
  await logActivity('hermes.delegate.started', { detail: input.slice(0, 120) })
  const res = await hermesRequest('v1/chat/completions', {
    method: 'POST',
    timeoutMs: opts.timeoutMs ?? 120_000,
    body: {
      model: 'hermes-agent',
      messages: [{ role: 'user', content: input.slice(0, 8000) }],
      conversation: opts.conversation ?? (conversation || 'elion'),
      stream: false
    }
  })
  if (!res.ok) {
    const detail =
      res.status === 401
        ? 'gateway rejected the API key (API_SERVER_KEY)'
        : `gateway replied ${res.status}`
    await logActivity('hermes.delegate.failed', { detail })
    throw new Error(`Hermes delegation failed: ${detail}.`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.json as any)?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    await logActivity('hermes.delegate.failed', { detail: 'empty reply' })
    throw new Error('Hermes returned an empty reply.')
  }
  await logActivity('hermes.delegate.completed', { detail: `→ ${text.slice(0, 120)}` })
  return text
}

export async function hermesListJobs(): Promise<HermesJob[]> {
  const res = await hermesRequest('api/jobs')
  if (!res.ok) throw new Error(`Hermes jobs list failed (HTTP ${res.status}).`)
  return mapHermesJobs(res.json)
}

export async function hermesCreateJob(input: { prompt: string; schedule: string; name?: string }): Promise<HermesJob> {
  const body: Record<string, unknown> = { prompt: input.prompt.slice(0, 4000), schedule: input.schedule.slice(0, 120) }
  if (input.name) body.name = input.name.slice(0, 120)
  const res = await hermesRequest('api/jobs', { method: 'POST', body })
  if (!res.ok) throw new Error(`Hermes job create failed (HTTP ${res.status}).`)
  const job = mapHermesJobs({ jobs: [res.json] })[0] ?? mapHermesJobs(res.json)[0]
  await logActivity('hermes.job.created', { detail: `${input.name ?? 'job'} · ${input.schedule}` })
  return job ?? { id: '(created)', prompt: input.prompt, schedule: input.schedule }
}

export async function hermesJobAction(id: string, action: 'pause' | 'resume' | 'run' | 'delete'): Promise<void> {
  const suffix = action === 'delete' ? '' : `/${action}`
  const res = await hermesRequest(`api/jobs/${encodeURIComponent(id)}${suffix}`, {
    method: action === 'delete' ? 'DELETE' : 'POST'
  })
  if (!res.ok) throw new Error(`Hermes job ${action} failed (HTTP ${res.status}).`)
  await logActivity(`hermes.job.${action === 'delete' ? 'deleted' : action}`, { detail: id })
}
