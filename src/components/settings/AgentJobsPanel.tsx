import { useCallback, useEffect, useState } from 'react'
import { createJob, deleteJob, describeSchedule, listJobs, runJobNow, setJobEnabled, type AgentJob, type AgentJobKind } from '../../lib/agentJobs'
import { Button, Input, Select } from '../ui'
import { timeAgo } from '../../lib/time'

/**
 * In-app cron (agent core) — job jalan lewat loop Sentient di dalam app:
 * instruksi → antrean prioritas → agent.reason (LLM + tools) → hasil nyata.
 * Jujur di UI: butuh app terbuka + runtime ON — bukan daemon OS.
 */
export function AgentJobsPanel() {
  const [jobs, setJobs] = useState<AgentJob[]>([])
  const [draft, setDraft] = useState<{ name: string; prompt: string; kind: AgentJobKind; at: string; intervalMin: string }>({
    name: '',
    prompt: '',
    kind: 'daily',
    at: '09:00',
    intervalMin: '60'
  })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setJobs(await listJobs())
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 6000)
    return () => clearInterval(t)
  }, [refresh])

  const create = async () => {
    setError(null)
    try {
      await createJob({
        name: draft.name,
        prompt: draft.prompt,
        kind: draft.kind,
        at: draft.kind === 'interval' ? undefined : draft.at,
        intervalMin: draft.kind === 'interval' ? Number(draft.intervalMin) || 60 : undefined
      })
      setDraft((d) => ({ ...d, name: '', prompt: '' }))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'job create failed')
    }
  }

  return (
    <div className="agent-panel">
      {jobs.length === 0 && (
        <p className="agent-empty">No scheduled jobs — e.g. “every morning: check my calendar and brief me”.</p>
      )}
      {jobs.map((j) => (
        <div key={j.id} className="agent-task">
          <code>{j.enabled ? describeSchedule(j) : 'disabled'}</code>
          <span title={j.prompt}>{j.name}</span>
          <em>
            {j.lastStatus ? `last ${j.lastStatus} ${j.lastRunAt ? timeAgo(new Date(j.lastRunAt).toISOString()) : ''}` : 'never ran'}
          </em>
          <span className="agent-inline-actions">
            <button type="button" className="mini-inline-action" onClick={() => void runJobNow(j.id).then(refresh)}>
              run now
            </button>
            <button
              type="button"
              className="mini-inline-action"
              onClick={() => void setJobEnabled(j.id, !j.enabled).then(refresh)}
            >
              {j.enabled ? 'pause' : 'enable'}
            </button>
            <button type="button" className="mini-inline-action" onClick={() => void deleteJob(j.id).then(refresh)}>
              delete
            </button>
          </span>
        </div>
      ))}

      <div className="agent-add">
        <Input
          value={draft.name}
          placeholder="Job name (optional)"
          aria-label="New agent job name"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <Input
          value={draft.prompt}
          placeholder="What Elion should do on each run — it has the same tools as in chat"
          aria-label="New agent job prompt"
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
        />
        <Select
          aria-label="New agent job schedule kind"
          value={draft.kind}
          onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as AgentJobKind }))}
        >
          <option value="daily">daily at…</option>
          <option value="interval">every N minutes</option>
          <option value="once">once at…</option>
        </Select>
        {draft.kind === 'interval' ? (
          <Input
            type="number"
            min={1}
            value={draft.intervalMin}
            aria-label="New agent job interval in minutes"
            onChange={(e) => setDraft((d) => ({ ...d, intervalMin: e.target.value }))}
          />
        ) : (
          <Input
            value={draft.at}
            placeholder={draft.kind === 'daily' ? '09:00' : 'YYYY-MM-DDTHH:MM'}
            aria-label="New agent job time"
            onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))}
          />
        )}
        <Button size="sm" variant="primary" onClick={() => void create()}>
          Schedule job
        </Button>
      </div>
      {error && (
        <p className="elion-error" role="alert">
          {error}
        </p>
      )}
      <p className="agent-note">
        Jobs execute while the app is open and Sentient Mode is on — they enter the same priority queue as every
        other task (scheduled commitments). The desktop build keeps the loop alive while the window runs in the tray.
      </p>
    </div>
  )
}
