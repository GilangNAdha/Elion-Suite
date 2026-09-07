import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Flame, Trophy, Clock3, X } from 'lucide-react'
import { useLockdownStore } from '../../stores/lockdownStore'
import { focusTotals, minutesLabel, toISODate, addDays } from '../../lib/time'
import { IconBtn, EmptyState } from '../ui'

export function FocusHistory({ onClose }: { onClose: () => void }) {
  const sessions = useLockdownStore((s) => s.sessions)
  const totals = useMemo(() => focusTotals(sessions), [sessions])

  const chart = useMemo(() => {
    const out: { day: string; min: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = addDays(new Date(), -i)
      const iso = toISODate(d)
      out.push({
        day: iso.slice(5),
        min: Math.round((totals.byDay.get(iso) ?? 0) / 60000)
      })
    }
    return out
  }, [totals])

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="elev-overlay relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-token-lg border border-line bg-raised p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.2em] font-bold">Focus history</h2>
          <IconBtn label="Close" onClick={onClose}>
            <X size={16} />
          </IconBtn>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Clock3 size={15} />} label="Total focus" value={minutesLabel(totals.totalMs)} />
          <Stat icon={<Flame size={15} />} label="Current streak" value={`${totals.currentStreak}d`} />
          <Stat icon={<Trophy size={15} />} label="Longest streak" value={`${totals.longestStreak}d`} />
          <Stat icon={<Clock3 size={15} />} label="Top preset" value={totals.topPreset ?? '—'} />
        </div>

        <div className="mb-4 h-40 rounded-token border border-line bg-surface/30 p-2">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--ink-faint)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} min`, 'focus']}
              />
              <Bar dataKey="min" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" hint="Your Lockdown sessions (length, preset, interruptions) will be logged here and on your Profile." />
        ) : (
          <ul className="space-y-1.5">
            {sessions.slice(0, 12).map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-token-sm bg-surface/40 px-3 py-2 text-[0.88em]">
                <span className="w-24 shrink-0 font-mono text-[0.8em] text-ink-faint">
                  {new Date(s.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.objective || s.presetName}</span>
                <span className="text-ink-muted">{s.presetName}</span>
                <span className="w-16 text-right tabular-nums text-ink-muted">
                  {minutesLabel(new Date(s.end).getTime() - new Date(s.start).getTime())}
                </span>
                <span className="w-20 text-right text-[0.75em] text-ink-faint">
                  {s.interruptions} interruptions
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-token border border-line bg-surface/40 p-3">
      <div className="flex items-center gap-1.5 text-[0.72em] font-semibold uppercase tracking-wider text-ink-faint">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate text-[1.4em] font-bold tabular-nums">{value}</div>
    </div>
  )
}
