import { useEffect, useState } from 'react'
import { CircleSlash, ShieldCheck } from 'lucide-react'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { PERMISSIONS, usePermissionStore, type PermissionMode } from '../../lib/permissions'
import { useActivityFeed } from '../../lib/activity'
import { addObjective, cancelTask, listObjectives, listTasks, setObjectiveDone, type AgentTask, type Objective } from '../../lib/agentTasks'
import { Button, Input, Toggle } from '../ui'
import { timeAgo } from '../../lib/time'

/**
 * Sentient control + permission center + monitor (§34, §46–§48).
 * Semua yang tampil di sini dibaca dari state runtime sungguhan:
 * store loop, tabel task/objectives Dexie, dan feed event yang ditulis
 * lapisan eksekusi — bukan narasi chat.
 */
export function AgentPanel() {
  const runtime = useRuntimeStore()
  const permissions = usePermissionStore()
  const feed = useActivityFeed()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!permissions.ready) void permissions.init()
    if (!feed.ready) void feed.init()
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async () => {
    setTasks(await listTasks(8))
    setObjectives(await listObjectives())
  }

  const active = tasks.filter((t) => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled')

  return (
    <div className="agent-panel">
      <Toggle
        label="Sentient Mode"
        hint="When on, ELION runs a real background loop: it processes the task queue, reinforces memory, and only pauses for your instructions or missing permissions. State lives in IndexedDB — closing the chat does not stop it; fully closing the app pauses it honestly."
        checked={runtime.enabled}
        onChange={useRuntimeStore.getState().setEnabled}
      />
      <div className="agent-status" role="status">
        <span className={`agent-dot ${runtime.busy ? 'is-busy' : ''}`} />
        <strong>{runtime.enabled ? (runtime.busy ? 'Acting' : runtime.phase === 'blocked-by-user' ? 'Paused for you' : 'Idle — no authorized useful work') : 'Off'}</strong>
        {runtime.activeTask && <span className="agent-active">“{runtime.activeTask}”</span>}
        {!runtime.activeTask && runtime.lastOutcome && <span className="agent-active">last: {runtime.lastOutcome}</span>}
        {runtime.enabled && (
          <Button size="sm" variant="ghost" icon={<CircleSlash size={12} />} onClick={() => runtime.setEnabled(false)}>
            Stop
          </Button>
        )}
      </div>

      {permissions.approvals.length > 0 && (
        <div className="agent-approvals" role="group" aria-label="Pending permission requests">
          {permissions.approvals.map((a) => (
            <div key={a.id} className="agent-approval">
              <ShieldCheck size={14} />
              <div>
                <strong>{PERMISSIONS.find((p) => p.key === a.key)?.label ?? a.key}</strong>
                <small>{a.reason}</small>
              </div>
              <span>
                <Button size="sm" variant="primary" onClick={() => void permissions.resolve(a.id, 'once')}>
                  Once
                </Button>
                <Button size="sm" variant="outline" onClick={() => void permissions.resolve(a.id, 'always')}>
                  Always
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void permissions.resolve(a.id, 'deny')}>
                  Deny
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="agent-columns">
        <div>
          <h3>Objectives</h3>
          {objectives.length === 0 && <p className="agent-empty">None yet — add what you want ELION to keep working toward.</p>}
          {objectives.map((o) => (
            <label key={o.id} className="agent-objective">
              <input type="checkbox" checked={o.done} onChange={() => void setObjectiveDone(o.id, !o.done)} />
              <span className={o.done ? 'is-done' : ''}>{o.text}</span>
            </label>
          ))}
          <div className="agent-add">
            <Input
              value={draft}
              placeholder="Keep my schedule organized"
              aria-label="New objective"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  void addObjective(draft.trim()).then(refresh)
                  setDraft('')
                }
              }}
            />
          </div>
        </div>
        <div>
          <h3>Task queue</h3>
          {active.length === 0 && <p className="agent-empty">Empty — loop idles until real work exists.</p>}
          {active.map((t) => (
            <div key={t.id} className="agent-task">
              <code>{t.status}</code>
              <span title={t.lastError ?? undefined}>{t.title}</span>
              <em>p{t.priority}·{t.attempts}/{t.maxAttempts}</em>
              <button type="button" className="mini-inline-action" onClick={() => void cancelTask(t.id).then(refresh)}>
                cancel
              </button>
            </div>
          ))}
        </div>
      </div>

      <details className="agent-permissions">
        <summary>Permissions ({PERMISSIONS.length})</summary>
        <table>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.key}>
                <td>
                  {p.label}
                  {p.risk === 'high' && <em className="agent-risk">egress</em>}
                </td>
                <td>
                  <select
                    aria-label={`Permission for ${p.label}`}
                    value={permissions.modes[p.key] ?? p.default}
                    onChange={(e) => void permissions.setMode(p.key, e.target.value as PermissionMode)}
                  >
                    <option value="allow">allow</option>
                    <option value="ask">ask</option>
                    <option value="deny">deny</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="agent-note">Owner policy: all permissions default to allow. Tighten any capability here — overrides always beat the default, and every decision is logged to the activity timeline.</p>
      </details>

      <details className="agent-events" open={active.length > 0}>
        <summary>Activity timeline (real events)</summary>
        <ul>
          {[...feed.events].reverse().slice(0, 14).map((e) => (
            <li key={e.id}>
              <code>{e.kind}</code>
              {e.detail && <span>{e.detail}</span>}
              <time>{timeAgo(e.at)}</time>
            </li>
          ))}
          {!feed.events.length && <li className="agent-empty">No events recorded yet.</li>}
        </ul>
      </details>
    </div>
  )
}
