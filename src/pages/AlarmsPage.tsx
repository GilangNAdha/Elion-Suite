import { useEffect, useState } from 'react'
import { BellRing, Plus, Trash2, Volume2 } from 'lucide-react'
import { db } from '../lib/db'
import type { Alarm } from '../lib/types'
import { uid } from '../lib/types'
import { useNotifyStore } from '../stores/notifyStore'
import { requestNotifyPermission } from '../lib/alarmEngine'
import { playChime } from '../lib/audio'
import { Button, EmptyState, IconBtn, Input, Select, Toggle } from '../components/ui'
import { timeAgo } from '../lib/time'

/**
 * Alarms & Reminders — every alarm creates a Notification-Center entry on
 * fire (one reminder pipeline, §7).
 */
export function AlarmsPage() {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [title, setTitle] = useState('')
  const [at, setAt] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [repeat, setRepeat] = useState<Alarm['repeat']>('none')
  const [perm, setPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  const reload = () =>
    void db.alarms.toArray().then((a) => setAlarms(a.sort((x, y) => x.at.localeCompare(y.at))))
  useEffect(reload, [])

  const add = async () => {
    if (!title.trim()) return
    const a: Alarm = { id: uid(), title: title.trim(), at: new Date(at).toISOString(), repeat, enabled: true }
    await db.alarms.add(a)
    setTitle('')
    reload()
  }

  return (
    <div className="mx-auto max-w-3xl p-6 pb-24">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-[1.7em] font-bold tracking-tight">
          <BellRing size={26} className="text-primary" />
          Alarms & Reminders
        </h1>
        <p className="text-[0.88em] text-ink-muted">
          Alarms ring in-app (and via system notifications where allowed) and appear in the Notification
          Center.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-token-lg border border-line bg-raised p-4">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-[0.78em] text-ink-muted">Title</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Standup"
            aria-label="Alarm title"
          />
        </label>
        <label>
          <span className="mb-1 block text-[0.78em] text-ink-muted">Time</span>
          <Input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            aria-label="Alarm time"
          />
        </label>
        <label>
          <span className="mb-1 block text-[0.78em] text-ink-muted">Repeat</span>
          <Select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as Alarm['repeat'])}
            className="w-28"
            aria-label="Repeat"
          >
            <option value="none">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </label>
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          disabled={!title.trim()}
          onClick={() => void add()}
        >
          Add
        </Button>
        <Button
          variant="outline"
          icon={<Volume2 size={14} />}
          onClick={() => {
            playChime('reminder')
            void useNotifyStore
              .getState()
              .push({ kind: 'alarm', title: 'Test alarm', body: 'This is how alarms sound.' })
          }}
        >
          Test
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-token border border-line bg-surface/40 px-4 py-3">
        <div className="text-[0.85em] text-ink-muted">
          System notifications:{' '}
          <strong className={perm === 'granted' ? 'text-ok' : 'text-warn'}>{perm}</strong>
          <span className="ml-2 text-[0.8em] text-ink-faint">
            Alarms always appear in the Notification Center.
          </span>
        </div>
        {perm !== 'granted' && perm !== 'unsupported' && (
          <Button
            size="sm"
            variant="soft"
            onClick={async () => {
              const ok = await requestNotifyPermission()
              setPerm(ok ? 'granted' : 'denied')
            }}
          >
            Enable
          </Button>
        )}
      </div>

      {alarms.length === 0 ? (
        <EmptyState
          icon={<BellRing size={20} />}
          title="No alarms"
          hint="Add one above — it will ring here and in the bell."
        />
      ) : (
        <ul className="space-y-2">
          {alarms.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-token border border-line bg-raised px-4 py-3"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${a.enabled ? 'bg-primary-soft text-primary' : 'bg-sunken text-ink-faint'}`}
              >
                <BellRing size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.95em] font-medium">{a.title}</div>
                <div className="text-[0.78em] text-ink-muted">
                  {new Date(a.at).toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  {a.repeat !== 'none' && ` / ${a.repeat}`}
                  {a.lastFired && ` / last fired ${timeAgo(a.lastFired)}`}
                </div>
              </div>
              <Toggle
                label=""
                checked={a.enabled}
                onChange={async (v) => {
                  await db.alarms.update(a.id, { enabled: v })
                  reload()
                }}
              />
              <IconBtn
                label={`Delete ${a.title}`}
                onClick={async () => {
                  await db.alarms.delete(a.id)
                  reload()
                }}
              >
                <Trash2 size={14} />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
