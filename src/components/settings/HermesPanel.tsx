import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  HERMES_DEFAULT_BASE,
  hermesCreateJob,
  hermesJobAction,
  probeHermes,
  useHermesStore,
  type HermesJob,
  type HermesSkill,
  type HermesStatus
} from '../../lib/hermes'
import { listSkills } from '../../lib/skills'
import { Button, Input } from '../ui'

/**
 * Hermes bridge panel (Settings › ELION runtime) — docs/HERMES-SETUP.md.
 * Semua angka dibaca langsung dari gateway user (`hermes gateway` + API
 * server); gateway tidak jalan → status offline yang jujur + langkah setup.
 * Tidak ada seed, tidak ada demo palsu (§67/§68).
 */
export function HermesPanel() {
  const config = useHermesStore()
  const [status, setStatus] = useState<HermesStatus | null>(null)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ledgerNames, setLedgerNames] = useState<string[]>([])
  const [jobDraft, setJobDraft] = useState({ name: '', schedule: '', prompt: '' })

  const refresh = useCallback(async () => {
    setProbing(true)
    setError(null)
    try {
      const next = await probeHermes()
      setStatus(next)
      if (!next.online) setError(next.error ?? 'gateway unreachable')
    } catch (e) {
      setStatus(null)
      setError(e instanceof Error ? e.message : 'gateway unreachable')
    } finally {
      setProbing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void listSkills().then((rows) => setLedgerNames(rows.filter((r) => r.origin === 'hermes-import').map((r) => r.name)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importSkills = async () => {
    setNotice(null)
    setError(null)
    try {
      const next = await probeHermes()
      if (!next.online) throw new Error(next.error ?? 'gateway offline')
      if (next.unauthorized) throw new Error('gateway rejected the API key — check API_SERVER_KEY below.')
      const existing = new Set(ledgerNames)
      let added = 0
      for (const s of next.skills) {
        if (existing.has(s.name)) continue
        const { recordSkill } = await import('../../lib/skills')
        await recordSkill({ name: s.name, origin: 'hermes-import', score: 0.6, evidence: 'imported from Hermes /v1/skills' })
        added++
      }
      setLedgerNames((prev) => [...prev, ...next.skills.filter((s) => !existing.has(s.name)).map((s) => s.name)])
      setNotice(`${added} skill${added === 1 ? '' : 's'} imported into the Skill Ledger (${next.skills.length - added} already present).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'import failed')
    }
  }

  const createJob = async () => {
    setNotice(null)
    setError(null)
    if (!jobDraft.prompt.trim() || !jobDraft.schedule.trim()) {
      setError('A job needs a prompt and a schedule (e.g. "daily 09:00").')
      return
    }
    try {
      await hermesCreateJob({ prompt: jobDraft.prompt, schedule: jobDraft.schedule, name: jobDraft.name || undefined })
      setJobDraft({ name: '', schedule: '', prompt: '' })
      setNotice('Job scheduled on the Hermes gateway.')
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'job create failed')
    }
  }

  const act = async (id: string, action: 'pause' | 'resume' | 'run' | 'delete') => {
    setError(null)
    try {
      await hermesJobAction(id, action)
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'job action failed')
    }
  }

  const online = status?.online && !status.unauthorized

  return (
    <div className="agent-panel" aria-label="Hermes agent bridge">
      <div className="agent-status" role="status">
        <span className={`agent-dot ${online ? 'is-busy' : ''}`} aria-hidden />
        <strong>
          {!status && !probing
            ? 'Hermes gateway — not checked'
            : probing && !status
              ? 'Checking…'
              : online
                ? `Hermes gateway online${status.model ? ` — ${status.model}` : ''}`
                : status?.unauthorized
                  ? 'Hermes gateway up — API key rejected'
                  : 'Hermes gateway offline'}
        </strong>
        {online && (
          <span className="agent-active">
            {status.skills.length} skills · {status.toolsets.length} toolsets · {status.jobs.length} jobs
          </span>
        )}
        <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={() => void refresh()}>
          Test
        </Button>
      </div>

      <p className="agent-note">
        Hermes is the agent runtime that runs on your machine (<code>hermes gateway</code> with the API server
        enabled) — Elion delegates work to it, imports its skills into the ledger, and schedules unattended jobs on
        it. Setup: <code>docs/HERMES-SETUP.md</code>.
      </p>

      <div className="agent-columns">
        <div>
          <label className="agent-objective" htmlFor="hermes-base">
            Gateway URL
          </label>
          <Input
            id="hermes-base"
            value={config.baseUrl}
            placeholder={HERMES_DEFAULT_BASE}
            onChange={(e) => config.set({ baseUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="agent-objective" htmlFor="hermes-key">
            API_SERVER_KEY
          </label>
          <Input
            id="hermes-key"
            type="password"
            value={config.apiKey}
            placeholder="empty if the gateway runs without a key"
            onChange={(e) => config.set({ apiKey: e.target.value })}
          />
        </div>
      </div>

      {error && (
        <p className="elion-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="elion-note" role="status">
          {notice}
        </p>
      )}

      {online && (
        <>
          <details className="agent-permissions">
            <summary>Skills on the gateway ({status.skills.length})</summary>
            {status.skills.length === 0 && <p className="agent-empty">The gateway reports no skills yet.</p>}
            <ul className="hermes-skill-list">
              {status.skills.slice(0, 12).map((s: HermesSkill) => (
                <li key={s.name}>
                  <code>{s.name}</code>
                  {s.description && <small title={s.description}> — {s.description.slice(0, 90)}</small>}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={() => void importSkills()}>
              Import into Skill Ledger
            </Button>
          </details>

          <details className="agent-permissions">
            <summary>Scheduled jobs ({status.jobs.length})</summary>
            {status.jobs.length === 0 && <p className="agent-empty">No unattended jobs on the gateway.</p>}
            {status.jobs.map((j: HermesJob) => (
              <div key={j.id} className="agent-task">
                <code>{j.paused ? 'paused' : (j.status ?? 'scheduled')}</code>
                <span title={j.prompt}>{j.name ?? j.id}</span>
                <em>{j.schedule ?? ''}</em>
                <span className="hermes-job-actions">
                  {j.paused ? (
                    <button type="button" className="mini-inline-action" onClick={() => void act(j.id, 'resume')}>
                      resume
                    </button>
                  ) : (
                    <button type="button" className="mini-inline-action" onClick={() => void act(j.id, 'pause')}>
                      pause
                    </button>
                  )}
                  <button type="button" className="mini-inline-action" onClick={() => void act(j.id, 'run')}>
                    run now
                  </button>
                  <button type="button" className="mini-inline-action" onClick={() => void act(j.id, 'delete')}>
                    delete
                  </button>
                </span>
              </div>
            ))}
            <div className="agent-add">
              <Input
                value={jobDraft.name}
                placeholder="Job name (optional)"
                aria-label="New Hermes job name"
                onChange={(e) => setJobDraft((d) => ({ ...d, name: e.target.value }))}
              />
              <Input
                value={jobDraft.schedule}
                placeholder='Schedule — e.g. "daily 09:00"'
                aria-label="New Hermes job schedule"
                onChange={(e) => setJobDraft((d) => ({ ...d, schedule: e.target.value }))}
              />
              <Input
                value={jobDraft.prompt}
                placeholder="What Hermes should do on each run"
                aria-label="New Hermes job prompt"
                onChange={(e) => setJobDraft((d) => ({ ...d, prompt: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createJob()
                }}
              />
              <Button size="sm" variant="primary" onClick={() => void createJob()}>
                Schedule job
              </Button>
            </div>
          </details>
        </>
      )}

      {!online && (
        <p className="agent-note">
          Gateway offline? Run <code>hermes gateway</code> on this machine with{' '}
          <code>API_SERVER_ENABLED=true</code> (and <code>API_SERVER_CORS_ORIGINS</code> set to this app's origin
          for the browser build). Chat can also use Hermes directly — pick “Hermes Agent (local runtime)” in
          Settings › AI assistant.
        </p>
      )}
    </div>
  )
}
