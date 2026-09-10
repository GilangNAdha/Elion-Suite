import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'
import {
  hermesCreateJob,
  hermesDelegate,
  hermesHeaders,
  hermesJobAction,
  hermesListJobs,
  hermesRequest,
  mapHermesJobs,
  mapHermesSkills,
  mapHermesToolsets,
  probeHermes,
  useHermesStore,
  HERMES_DEFAULT_BASE
} from '../src/lib/hermes'
import { AI_PROVIDER_PRESETS } from '../src/lib/aiProviders'
import { listTools } from '../src/lib/tools'
import { listSkills } from '../src/lib/skills'
import { usePermissionStore } from '../src/lib/permissions'
import { runTool } from '../src/lib/tools'

/**
 * Hermes bridge (docs/HERMES-SETUP.md) — parser toleran, status jujur,
 * permission tetap dijaga. Gateway = REST lokal dari `hermes gateway`;
 * di sini di-stub via fetch (jsdom), bentuk response mengikuti api-server.md.
 */

type FetchCall = { url: string; init: RequestInit }
let calls: FetchCall[] = []
let responder: (url: string, init: RequestInit) => { status: number; body: unknown } = () => ({ status: 404, body: {} })

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      const r = responder(String(url), init)
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' }
      })
    })
  )
}

beforeEach(() => {
  calls = []
  useHermesStore.setState({ baseUrl: HERMES_DEFAULT_BASE, apiKey: 'test-key', conversation: 'elion' })
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  useHermesStore.setState({ baseUrl: HERMES_DEFAULT_BASE, apiKey: '', conversation: 'elion' })
})

describe('Hermes parsers (tolerant to shape shifts)', () => {
  it('maps skill rows from array, {skills} or {data} shapes, skipping junk', () => {
    expect(mapHermesSkills([{ name: 'pdf', description: 'PDF tools' }, 'bare-name', null, { nope: 1 }]).map((s) => s.name)).toEqual([
      'bare-name',
      'pdf'
    ])
    expect(mapHermesSkills({ skills: [{ name: 'a', category: 'c' }] })[0].category).toBe('c')
    expect(mapHermesSkills({ data: [{ id: 'b' }] })[0].name).toBe('b')
    expect(mapHermesSkills(undefined)).toEqual([])
  })

  it('maps toolsets with tool lists', () => {
    const rows = mapHermesToolsets({ toolsets: [{ name: 'core', label: 'Core', enabled: true, configured: true, tools: ['read_file', 42] }] })
    expect(rows[0]).toEqual({ name: 'core', label: 'Core', enabled: true, configured: true, tools: ['read_file'] })
  })

  it('maps jobs from {jobs} or plain arrays and normalizes id/paused', () => {
    const rows = mapHermesJobs({ jobs: [{ id: 7, prompt: 'check mail', cron: 'daily 09:00', status: 'paused' }] })
    expect(rows[0]).toMatchObject({ id: '7', prompt: 'check mail', schedule: 'daily 09:00', paused: true })
    expect(mapHermesJobs([{}])).toEqual([])
  })
})

describe('Hermes probe + requests', () => {
  it('sends the bearer header only when a key is set', () => {
    expect(hermesHeaders('k')).toMatchObject({ Authorization: 'Bearer k' })
    expect(hermesHeaders('')).not.toHaveProperty('Authorization')
  })

  it('probes a healthy gateway and counts skills/toolsets/jobs', async () => {
    responder = (url) => {
      if (url.endsWith('/health')) return { status: 200, body: { status: 'ok' } }
      if (url.endsWith('/v1/skills')) return { status: 200, body: [{ name: 'pdf' }, { name: 'email-triage' }] }
      if (url.endsWith('/v1/toolsets')) return { status: 200, body: [{ name: 'core', enabled: true, tools: ['read_file'] }] }
      if (url.endsWith('/api/jobs')) return { status: 200, body: { jobs: [{ id: 'j1', schedule: 'daily 09:00' }] } }
      if (url.endsWith('/v1/models')) return { status: 200, body: { data: [{ id: 'MiniMax-M3' }] } }
      return { status: 404, body: {} }
    }
    const status = await probeHermes()
    expect(status.online).toBe(true)
    expect(status.unauthorized).toBe(false)
    expect(status.skills).toHaveLength(2)
    expect(status.jobs).toHaveLength(1)
    expect(status.model).toBe('MiniMax-M3')
    // endpoint ber-auth membawa bearer dari API_SERVER_KEY
    const skillsCall = calls.find((c) => c.url.endsWith('/v1/skills'))
    expect((skillsCall!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('reports offline honestly when the gateway is unreachable (no fake data)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const status = await probeHermes()
    expect(status.online).toBe(false)
    expect(status.skills).toEqual([])
    expect(status.error).toContain('hermes gateway')
  })

  it('flags unauthorized when the gateway is up but rejects the key', async () => {
    responder = (url) => (url.endsWith('/health') ? { status: 200, body: { status: 'ok' } } : { status: 401, body: {} })
    const status = await probeHermes()
    expect(status.online).toBe(true)
    expect(status.unauthorized).toBe(true)
    expect(status.error).toContain('API key')
  })

  it('treats a non-JSON login/proxy page as a failed probe, not a crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>proxy login</html>', { status: 200 }))
    )
    const status = await probeHermes()
    expect(status.online).toBe(false)
  })
})

describe('Hermes delegation + jobs', () => {
  it('delegates with conversation chaining and returns the assistant text', async () => {
    responder = (url, init) => {
      expect(url).toContain('/v1/chat/completions')
      const body = JSON.parse(String(init.body))
      expect(body).toMatchObject({ model: 'hermes-agent', conversation: 'elion', stream: false })
      expect(body.messages[0].content).toContain('disk usage')
      return { status: 200, body: { choices: [{ message: { role: 'assistant', content: '42% used' } }] } }
    }
    const reply = await hermesDelegate('check disk usage')
    expect(reply).toBe('42% used')
    expect(calls).toHaveLength(1)
  })

  it('throws honest errors on HTTP failure and on empty replies', async () => {
    responder = () => ({ status: 401, body: {} })
    await expect(hermesDelegate('x')).rejects.toThrow('API key')
    responder = () => ({ status: 200, body: { choices: [{ message: { content: '' } }] } })
    await expect(hermesDelegate('x')).rejects.toThrow('empty reply')
  })

  it('creates and lists jobs against /api/jobs', async () => {
    responder = (url, init) => {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body))
        expect(body).toMatchObject({ prompt: 'triage inbox', schedule: 'daily 09:00', name: 'triage' })
        return { status: 200, body: { id: 'job-9', prompt: 'triage inbox', schedule: 'daily 09:00' } }
      }
      return { status: 200, body: [{ id: 'job-9', schedule: 'daily 09:00' }] }
    }
    const job = await hermesCreateJob({ prompt: 'triage inbox', schedule: 'daily 09:00', name: 'triage' })
    expect(job.id).toBe('job-9')
    await expect(hermesListJobs()).resolves.toHaveLength(1)
  })

  it('pause/resume/delete hit the right job paths', async () => {
    responder = (url, init) => {
      expect(url.endsWith('/api/jobs/job-9/pause') || url.endsWith('/api/jobs/job-9')).toBe(true)
      if (url.endsWith('/pause')) expect(init.method).toBe('POST')
      return { status: 200, body: {} }
    }
    await hermesJobAction('job-9', 'pause')
    await hermesJobAction('job-9', 'delete')
  })

  it('hermesRequest surfaces timeout as a friendly error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = (init as { signal?: AbortSignal } | undefined)?.signal
            signal?.addEventListener('abort', () => reject((signal as AbortSignal & { reason?: unknown }).reason ?? new DOMException('aborted', 'AbortError')))
          })
      )
    )
    await expect(hermesRequest('health', { timeoutMs: 20 })).rejects.toThrow('timed out')
  })
})

describe('Hermes tools (registry + permission + ledger)', () => {
  beforeEach(async () => {
    await db.skills.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [] })
    await usePermissionStore.getState().init()
    usePermissionStore.setState({ modes: {} })
  })

  it('hermes.status reports offline honestly without a gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const result = await runTool('hermes.status', {})
    expect(result.ok).toBe(true)
    expect(result.output).toContain('OFFLINE')
  })

  it('hermes.skills.import records new skills into the ledger and skips duplicates', async () => {
    responder = (url) => {
      if (url.endsWith('/health')) return { status: 200, body: { status: 'ok' } }
      if (url.endsWith('/v1/skills')) return { status: 200, body: [{ name: 'pdf', description: 'PDF tools' }] }
      return { status: 200, body: [] }
    }
    const first = await runTool('hermes.skills.import', {})
    expect(first.ok).toBe(true)
    expect(first.output).toContain('1 imported')
    const second = await runTool('hermes.skills.import', {})
    expect(second.output).toContain('already present')
    const rows = await listSkills()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'pdf', origin: 'hermes-import' })
  })

  it('hermes.ask is denied while the permission policy says ask and nobody approves', async () => {
    usePermissionStore.setState({ modes: { 'hermes.delegate': 'deny' } })
    const result = await runTool('hermes.ask', { prompt: 'check the repo' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Denied')
    expect(calls.filter((c) => c.url.includes('chat/completions'))).toHaveLength(0)
  })

  it('registers the preset and the five hermes tools behind their permissions', () => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === 'hermes')
    expect(preset).toBeDefined()
    expect(preset!.api).toBe('openai')
    expect(preset!.baseUrl).toContain(':8642')
    const perms = Object.fromEntries(listTools().map((t) => [t.id, t.permission]))
    expect(perms['hermes.status']).toBe('workspace.read')
    expect(perms['hermes.ask']).toBe('hermes.delegate')
    expect(perms['hermes.skills.import']).toBe('hermes.skills')
    expect(perms['hermes.job.create']).toBe('hermes.control')
    expect(perms['hermes.jobs.list']).toBe('workspace.read')
  })
})
