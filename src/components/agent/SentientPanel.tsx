import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleSlash, Play } from 'lucide-react'
import { useRuntimeStore } from '../../lib/agentRuntime'
import { PERMISSIONS, effectiveMode, usePermissionStore } from '../../lib/permissions'
import { listObjectives, listTasks } from '../../lib/agentTasks'
import { Button } from '../ui'

/**
 * Panel status Sentient (§11 spek v4.3) — kompak, dibaca dari state runtime
 * nyata: store loop, tabel task/objectives, policy permission efektif.
 * Kontrol Start/Stop di sini = kontrol yang sama dengan Settings (satu state).
 */
export function SentientPanel() {
  const runtime = useRuntimeStore()
  void usePermissionStore((s) => s.modes)
  const [running, setRunning] = useState(0)
  const [objective, setObjective] = useState<string | null>(null)

  useEffect(() => {
    const refresh = async () => {
      const tasks = await listTasks(200)
      setRunning(tasks.filter((t) => t.status === 'running').length)
      const objectives = await listObjectives()
      setObjective(objectives.find((o) => !o.done)?.text ?? null)
    }
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [])

  const activity = runtime.activeTask ?? phaseLabel(runtime.phase, runtime.enabled)
  return (
    <section className="sentient-panel" aria-label="Sentient Mode status">
      <div className="sentient-head">
        <span className={`sentient-dot ${runtime.enabled ? 'is-on' : ''}`} aria-hidden />
        <strong>Sentient Mode {runtime.enabled ? '● Active' : '○ Off'}</strong>
        {runtime.enabled ? (
          <Button size="sm" variant="ghost" icon={<CircleSlash size={12} />} onClick={() => runtime.setEnabled(false)}>
            Stop
          </Button>
        ) : (
          <Button size="sm" variant="outline" icon={<Play size={12} />} onClick={() => runtime.setEnabled(true)}>
            Start
          </Button>
        )}
      </div>
      <dl className="sentient-rows">
        <div>
          <dt>Current activity</dt>
          <dd>{activity}</dd>
        </div>
        <div>
          <dt>Objective</dt>
          <dd>{objective ?? '—'}</dd>
        </div>
        <div>
          <dt>Background</dt>
          <dd>
            {running} task{running === 1 ? '' : 's'} running
          </dd>
        </div>
      </dl>
      <div className="sentient-perms" aria-label="Active permissions">
        {PERMISSIONS.map((p) => {
          const mode = effectiveMode(p.key)
          return (
            <span key={p.key} data-mode={mode} title={`${p.label}: ${mode}`}>
              {mode === 'allow' ? '✓' : mode === 'ask' ? '?' : '✕'} {shortLabel(p.key)}
            </span>
          )
        })}
      </div>
      <Link className="sentient-more" to="/settings#runtime">
        Full runtime control →
      </Link>
    </section>
  )
}

function phaseLabel(phase: string, enabled: boolean): string {
  if (!enabled) return 'Off'
  if (phase === 'acting') return 'Acting'
  if (phase === 'observing') return 'Observing'
  if (phase === 'blocked-by-user') return 'Paused for you'
  return 'Idle — no authorized useful work'
}

function shortLabel(key: string): string {
  return key
    .split('.')
    .map((w) => (w === 'write' ? 'w' : w === 'read' ? 'r' : w))
    .join(' ')
}
