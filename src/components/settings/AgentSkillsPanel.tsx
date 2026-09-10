import { useCallback, useEffect, useState } from 'react'
import {
  createSkill,
  deleteSkill,
  listSkills,
  runSkill,
  setSkillEnabled,
  type AgentSkill,
  type SkillRunStep
} from '../../lib/agentSkills'
import { listTools } from '../../lib/tools'
import { Button, Input, Select } from '../ui'
import { timeAgo } from '../../lib/time'

interface DraftStep {
  tool: string
  argsJson: string
}

/**
 * Executable skills (Hermes lineage, embedded) — named packs of real tool
 * steps. Ditulis manual di sini atau di-author Elion sendiri dari chat
 * (skills.create → ledger). Tiap langkah tetap lewat gerbang permission.
 */
export function AgentSkillsPanel() {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [toolOptions, setToolOptions] = useState<{ id: string; label: string }[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([{ tool: 'tasks.create', argsJson: '{"title": "…"}' }])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<{ name: string; ok: boolean; steps: SkillRunStep[] } | null>(null)

  const refresh = useCallback(async () => {
    setSkills(await listSkills())
  }, [])

  useEffect(() => {
    void refresh()
    setToolOptions(listTools().map((t) => ({ id: t.id, label: t.label })))
  }, [refresh])

  const save = async () => {
    setError(null)
    setNotice(null)
    try {
      const parsed = steps.map((s) => ({ tool: s.tool, args: JSON.parse(s.argsJson || '{}') }))
      const skill = await createSkill({ name, description, steps: parsed, origin: 'user' })
      setNotice(`Skill “${skill.name}” saved — ${skill.steps.length} step${skill.steps.length === 1 ? '' : 's'}.`)
      setName('')
      setDescription('')
      setSteps([{ tool: 'tasks.create', argsJson: '{"title": "…"}' }])
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'skill save failed')
    }
  }

  const run = async (idOrName: string) => {
    setError(null)
    setNotice(null)
    const run = await runSkill(idOrName)
    if (run.skill) setLastRun({ name: run.skill.name, ok: run.ok, steps: run.steps })
    if (!run.skill) setError(run.error ?? 'skill not found')
    await refresh()
  }

  return (
    <div className="agent-panel">
      {skills.length === 0 && <p className="agent-empty">No skills yet — build one below or ask Elion in chat (“author a skill that…”).</p>}
      {skills.map((s) => (
        <div key={s.id} className="agent-task">
          <code>{s.enabled ? `${s.steps.length} step${s.steps.length === 1 ? '' : 's'}` : 'disabled'}</code>
          <span title={s.description ?? s.steps.map((x) => x.title).join(' → ')}>
            {s.name} <em>[{s.origin}]</em>
          </span>
          <em>
            {s.runCount > 0 ? `ran ×${s.runCount} · ${s.lastStatus} · ${s.lastRunAt ? timeAgo(s.lastRunAt) : ''}` : 'never ran'}
          </em>
          <span className="hermes-job-actions">
            <button type="button" className="mini-inline-action" onClick={() => void run(s.id)}>
              run
            </button>
            <button
              type="button"
              className="mini-inline-action"
              onClick={() => void setSkillEnabled(s.id, !s.enabled).then(refresh)}
            >
              {s.enabled ? 'disable' : 'enable'}
            </button>
            <button type="button" className="mini-inline-action" onClick={() => void deleteSkill(s.id).then(refresh)}>
              delete
            </button>
          </span>
        </div>
      ))}

      {lastRun && (
        <details className="agent-events" open>
          <summary>
            Last run: {lastRun.name} — {lastRun.ok ? 'ok' : 'stopped on error'}
          </summary>
          <ul>
            {lastRun.steps.map((s, i) => (
              <li key={i}>
                <code>{s.ok ? '✓' : '✕'}</code>
                <span>
                  {s.title} <small>({s.tool})</small> {s.error && <small>— {s.error}</small>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="agent-permissions">
        <summary>Author a skill</summary>
        <div className="agent-columns">
          <div>
            <Input value={name} placeholder="Skill name (e.g. standup-notes)" aria-label="New skill name" onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Input
              value={description}
              placeholder="What it does (one sentence)"
              aria-label="New skill description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        {steps.map((s, i) => (
          <div key={i} className="agent-columns">
            <div>
              <Select
                aria-label={`Step ${i + 1} tool`}
                value={s.tool}
                onChange={(e) => setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, tool: e.target.value } : x)))}
              >
                {toolOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} — {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Input
                value={s.argsJson}
                placeholder='{"title": "…"}'
                aria-label={`Step ${i + 1} arguments (JSON)`}
                onChange={(e) => setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, argsJson: e.target.value } : x)))}
              />
            </div>
            <button type="button" className="mini-inline-action" onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}>
              remove
            </button>
          </div>
        ))}
        <div className="agent-add">
          <Button size="sm" variant="outline" onClick={() => setSteps((prev) => [...prev, { tool: 'notifications.send', argsJson: '{}' }])}>
            Add step
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()}>
            Save skill
          </Button>
        </div>
      </details>

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
      <p className="agent-note">
        A skill is a named sequence of real tool calls — every step passes the same permission gate as anywhere else.
        Skills Elion authors itself land in the Skill Ledger automatically.
      </p>
    </div>
  )
}
