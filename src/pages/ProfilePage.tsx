import { useMemo, useState } from 'react'
import { UserRound, Flame, CheckCircle2, FileText, Lock, Trophy } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { useLockdownStore } from '../stores/lockdownStore'
import { focusTotals, minutesLabel, todayISO, addDays, toISODate } from '../lib/time'
import { Button, Input } from '../components/ui'

/**
 * Profile — stats are mirrored from the shared stores (§7): focus history
 * comes from the same FocusSession records Lockdown writes, completion
 * counts from the items store, pages from the pages store.
 */
export function ProfilePage() {
  const profileName = useSettingsStore((s) => s.profileName)
  const setProfileName = useSettingsStore((s) => s.setProfileName)
  const items = useItemsStore((s) => s.items)
  const databases = useItemsStore((s) => s.databases)
  const pages = usePagesStore((s) => s.pages)
  const sessions = useLockdownStore((s) => s.sessions)
  const [name, setName] = useState(profileName)

  const all = Object.values(items)
  const totals = useMemo(() => focusTotals(sessions), [sessions])
  const weekAgo = toISODate(addDays(new Date(), -7))
  const doneThisWeek = all.filter(
    (i) =>
      i.updatedAt.slice(0, 10) >= weekAgo &&
      databases[i.databaseId ?? '']?.statuses.find((s) => s.id === i.status)?.isDone
  ).length
  const habitsDoneWeek = all.reduce((a, i) => a + (i.completions ?? []).filter((d) => d >= weekAgo).length, 0)

  const initials = profileName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-3xl p-6 pb-24">
      <div className="elev-raised mb-5 flex items-center gap-4 rounded-token-lg border border-line bg-raised p-5">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-[1.4em] font-bold text-primary-on"
          style={{ background: 'linear-gradient(135deg, var(--c1), var(--c2))' }}
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.4em] font-bold tracking-tight">{profileName}</h1>
          <p className="text-[0.82em] text-ink-muted">Local profile — nothing leaves this device.</p>
        </div>
        <div className="flex gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-36"
            aria-label="Display name"
          />
          <Button size="sm" variant="soft" onClick={() => setProfileName(name.trim() || 'You')}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          icon={<Lock size={15} />}
          label="Total focus"
          value={minutesLabel(totals.totalMs)}
          sub={`${totals.sessionCount} sessions`}
        />
        <Card
          icon={<Flame size={15} />}
          label="Focus streak"
          value={`${totals.currentStreak}d`}
          sub={`longest ${totals.longestStreak}d`}
        />
        <Card
          icon={<CheckCircle2 size={15} />}
          label="Done (7 days)"
          value={String(doneThisWeek + habitsDoneWeek)}
          sub="tasks + habit checks"
        />
        <Card
          icon={<FileText size={15} />}
          label="Pages"
          value={String(Object.keys(pages).length)}
          sub={`${Object.keys(pages).filter((id) => pages[id].branch === 'personal').length} notes`}
        />
      </div>

      <div className="mt-4 rounded-token border border-line bg-surface/40 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[0.85em] font-semibold">
          <Trophy size={14} className="text-warn" />
          Most-used Lockdown preset
        </div>
        <div className="text-[1.1em] font-semibold">{totals.topPreset ?? '—'}</div>
        <p className="mt-1 text-[0.78em] text-ink-faint">
          These numbers are mirrored from the same session records the Lockdown Focus history reads — one
          source of truth.
        </p>
      </div>
    </div>
  )
}

function Card({
  icon,
  label,
  value,
  sub
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-token border border-line bg-raised p-4">
      <div className="flex items-center gap-1.5 text-[0.72em] font-semibold  text-ink-faint">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-[1.7em] font-bold tabular-nums">{value}</div>
      <div className="text-[0.72em] text-ink-faint">{sub}</div>
    </div>
  )
}
