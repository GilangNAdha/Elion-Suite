import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Trash2, TrendingDown } from 'lucide-react'
import type { Sprint, WorkspaceDatabase, WorkspaceItem } from '../../lib/types'
import { uid } from '../../lib/types'
import { Drawer } from '../editor/panels'
import { Button, Input, Tabs } from '../ui'
import { useItemsStore } from '../../stores/itemsStore'
import { usePagesStore } from '../../stores/pagesStore'
import { useToasts } from '../ui'
import { todayISO } from '../../lib/time'

export function SprintPanel({
  db,
  items,
  onClose
}: {
  db: WorkspaceDatabase
  items: WorkspaceItem[]
  onClose: () => void
}) {
  const sprints = useItemsStore((s) => s.sprints)
  const upsertSprint = useItemsStore((s) => s.upsertSprint)
  const deleteSprint = useItemsStore((s) => s.deleteSprint)
  const history = useItemsStore((s) => s.statusHistory)
  const push = useToasts((s) => s.push)
  const [tab, setTab] = useState<'sprints' | 'backlog' | 'reports'>('sprints')
  const [name, setName] = useState('')
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 13)
    return d.toISOString().slice(0, 10)
  })
  const [goal, setGoal] = useState('')

  const dbSprints = useMemo(
    () => Object.values(sprints).filter((s) => s.databaseId === db.id).sort((a, b) => a.start.localeCompare(b.start)),
    [sprints, db.id]
  )
  const active = dbSprints.find((s) => s.start <= todayISO() && s.end >= todayISO()) ?? null

  const sprintItems = (sid: string) => items.filter((i) => i.sprintId === sid)
  const backlog = items.filter((i) => !i.sprintId).sort((a, b) => a.rank - b.rank)

  // ---- report data from real status history ----
  const reportRange = active ?? dbSprints[dbSprints.length - 1]

  const burndownData = useMemo(() => {
    if (!reportRange) return []
    const days: string[] = []
    const d = new Date(reportRange.start + 'T00:00:00')
    const endD = new Date(reportRange.end + 'T00:00:00')
    while (d <= endD) {
      days.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
    const items0 = sprintItems(reportRange.id)
    const totalPoints = items0.reduce((a, i) => a + (i.storyPoints ?? 0), 0)
    return days.map((day) => {
      let remaining = 0
      for (const it of items0) {
        const pts = it.storyPoints ?? 0
        if (pts === 0) continue
        // done = currently done (no history) or last history event to a done status <= day
        const doneStatuses = db.statuses.filter((s) => s.isDone).map((s) => s.id)
        const events = history
          .filter((h) => h.itemId === it.id)
          .sort((a, b) => a.at.localeCompare(b.at))
        const stateAt = events.find((e) => e.at.slice(0, 10) <= day)
        const done =
          doneStatuses.includes(it.status) &&
          (!stateAt || !doneStatuses.includes(stateAt.from) || stateAt.to === it.status)
        if (!done) remaining += pts
      }
      const idx = days.indexOf(day)
      const total = Math.max(1, days.length - 1)
      const ideal = Math.max(0, Math.round(totalPoints * (1 - idx / total)))
      return { day: day.slice(5), ideal, remaining }
    })
  }, [reportRange, items, history, db])

  const velocityData = useMemo(() => {
    const doneIds = new Set(db.statuses.filter((s) => s.isDone).map((s) => s.id))
    return dbSprints.map((sp) => {
      const moved = history.filter(
        (h) =>
          h.to &&
          doneIds.has(h.to) &&
          items.some((i) => i.id === h.itemId && i.sprintId === sp.id)
      )
      const pts = moved.reduce((a, h) => {
        const it = items.find((i) => i.id === h.itemId)
        return a + (it?.storyPoints ?? 0)
      }, 0)
      return { name: sp.name, points: pts }
    })
  }, [dbSprints, history, items, db])

  const flowData = useMemo(() => {
    if (!reportRange) return []
    const days: string[] = []
    const d = new Date(reportRange.start + 'T00:00:00')
    const endD = new Date(reportRange.end + 'T00:00:00')
    while (d <= endD) {
      days.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
    const sIds = sprintItems(reportRange.id)
    return days.map((day) => {
      const row: Record<string, number | string> = { day: day.slice(5) }
      for (const st of db.statuses) {
        row[st.name] = sIds.filter((it) => {
          const events = history
            .filter((h) => h.itemId === it.id)
            .sort((a, b) => a.at.localeCompare(b.at))
          const e = events.find((x) => x.at.slice(0, 10) <= day)
          const statusAt = e ? e.to : it.status
          return statusAt === st.id
        }).length
      }
      return row
    })
  }, [reportRange, items, history, db])

  return (
    <Drawer title="Sprints, backlog & reports" icon={<TrendingDown size={15} />} onClose={onClose}>
      <div className="p-1">
        <Tabs
          tabs={[
            { id: 'sprints', label: 'Sprints' },
            { id: 'backlog', label: 'Backlog' },
            { id: 'reports', label: 'Reports' }
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'sprints' && (
        <div className="mt-3 space-y-2">
          {dbSprints.map((sp) => {
            const its = sprintItems(sp.id)
            const pts = its.reduce((a, i) => a + (i.storyPoints ?? 0), 0)
            const donePts = its
              .filter((i) => db.statuses.find((s) => s.id === i.status)?.isDone)
              .reduce((a, i) => a + (i.storyPoints ?? 0), 0)
            return (
              <div key={sp.id} className={`rounded-token border p-3 ${active?.id === sp.id ? 'border-primary bg-primary/5' : 'border-line bg-surface/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[0.95em] font-semibold">{sp.name}</span>
                  <div className="flex items-center gap-2">
                    {active?.id === sp.id && (
                      <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-[0.68em] font-bold text-primary">ACTIVE</span>
                    )}
                    <button className="focus-ring rounded p-1 text-ink-faint hover:text-bad" aria-label={`Delete ${sp.name}`} onClick={() => void deleteSprint(sp.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-[0.78em] text-ink-muted">
                  {sp.start} → {sp.end} · {its.length} items · {donePts}/{pts} pts
                  {sp.goal ? ` · goal: ${sp.goal}` : ''}
                </div>
              </div>
            )
          })}
          <div className="rounded-token border border-dashed border-line p-3">
            <div className="mb-2 text-[0.8em] font-semibold text-ink-muted">New sprint</div>
            <div className="space-y-1.5">
              <Input placeholder="Sprint name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Sprint name" />
              <div className="flex gap-1.5">
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Sprint start" />
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Sprint end" />
              </div>
              <Input placeholder="Goal (optional)" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Sprint goal" />
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                icon={<Plus size={13} />}
                disabled={!name.trim()}
                onClick={async () => {
                  const s: Sprint = { id: uid(), databaseId: db.id, name: name.trim(), start, end, goal: goal.trim() || undefined }
                  await upsertSprint(s)
                  setName('')
                  setGoal('')
                  push(`Sprint “${s.name}” created`, 'success')
                }}
              >
                Create sprint
              </Button>
            </div>
          </div>
          <p className="text-[0.72em] leading-relaxed text-ink-faint">
            Assign items to sprints from the item editor. The “Sprint only” board view shows the active sprint.
          </p>
        </div>
      )}

      {tab === 'backlog' && (
        <div className="mt-3">
          <div className="mb-2 text-[0.8em] text-ink-muted">{backlog.length} items ranked (highest first)</div>
          <div className="space-y-1">
            {backlog.map((i, idx) => (
              <div key={i.id} className="flex items-center gap-2 rounded-token-sm bg-surface/40 px-2 py-1.5">
                <span className="w-6 text-right font-mono text-[0.7em] text-ink-faint">{idx + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[0.88em]">{i.title}</span>
                <span className="text-[0.7em] text-ink-faint">{i.storyPoints ?? 0} pts</span>
              </div>
            ))}
            {backlog.length === 0 && <div className="py-6 text-center text-[0.82em] text-ink-faint">Backlog is empty</div>}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="mt-3 space-y-4">
          <div>
            <div className="mb-1 text-[0.82em] font-semibold text-ink-muted">
              Burndown {active ? `— ${active.name}` : '— (no active sprint)'}
            </div>
            <div className="h-44 rounded-token border border-line bg-surface/30 p-2">
              <ResponsiveContainer>
                <LineChart data={burndownData}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="ideal" stroke="var(--ink-faint)" strokeDasharray="4 4" dot={false} name="Ideal" />
                  <Line type="monotone" dataKey="remaining" stroke="var(--primary)" dot={false} name="Remaining" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[0.82em] font-semibold text-ink-muted">Velocity (points completed per sprint)</div>
            <div className="h-40 rounded-token border border-line bg-surface/30 p-2">
              <ResponsiveContainer>
                <BarChart data={velocityData}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="points" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[0.82em] font-semibold text-ink-muted">Cumulative flow</div>
            <div className="h-44 rounded-token border border-line bg-surface/30 p-2">
              <ResponsiveContainer>
                <AreaChart data={flowData}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {db.statuses.slice(0, 5).map((s, i) => (
                    <Area
                      key={s.id}
                      type="monotone"
                      dataKey={s.name}
                      stackId="1"
                      stroke={s.color}
                      fill={`var(--c${(i % 6) + 1})`}
                      fillOpacity={0.35}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="text-[0.72em] leading-relaxed text-ink-faint">
            Reports are driven by real status-history data recorded on every transition.
          </p>
        </div>
      )}
    </Drawer>
  )
}

