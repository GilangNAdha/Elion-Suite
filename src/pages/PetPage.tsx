import { Sparkles, Hand } from 'lucide-react'
import { usePetStore } from '../stores/petStore'
import { Pet } from '../components/pet/Pet'
import { Button } from '../components/ui'
import { timeAgo } from '../lib/time'

const MOOD_COPY: Record<string, string> = {
  idle: 'Content. Just along for the ride.',
  focused: 'Locked in with you during a Lockdown session.',
  happy: 'Proud — you checked something off recently.',
  tired: 'It’s late. Maybe wrap up soon?',
  worried: 'A couple of items are overdue. We can fix that.'
}

export function PetPage() {
  const mood = usePetStore((s) => s.mood)
  const since = usePetStore((s) => s.since)
  const bumpHappy = usePetStore((s) => s.bumpHappy)

  return (
    <div className="mx-auto max-w-2xl p-6 pb-24">
      <h1 className="mb-1 flex items-center gap-2 text-[1.7em] font-bold tracking-tight">
        <Sparkles size={26} className="text-primary" />
        Pet companion
      </h1>
      <p className="mb-6 text-[0.88em] text-ink-muted">
        One shared pet — the same mood shows on the Dashboard and in Lockdown, driven by your real activity (focus
        sessions, completions, overdue items, time of day).
      </p>

      <div className="elev-raised flex flex-col items-center gap-4 rounded-token-lg border border-line bg-raised p-8">
        <Pet mood={mood} size={180} />
        <div className="text-center">
          <div className="text-[1.1em] font-semibold capitalize">{mood}</div>
          <div className="mt-1 max-w-sm text-[0.88em] text-ink-muted">{MOOD_COPY[mood]}</div>
          <div className="mt-1 text-[0.72em] text-ink-faint">mood since {timeAgo(since)}</div>
        </div>
        <Button variant="soft" icon={<Hand size={14} />} onClick={bumpHappy}>
          Cheer the pet
        </Button>
      </div>

      <div className="mt-4 rounded-token border border-line bg-surface/40 p-4 text-[0.82em] leading-relaxed text-ink-muted">
        <strong className="text-ink">How moods work:</strong> starting a Lockdown session → <em>focused</em>;
        completing a habit or task → <em>happy</em> for 10 minutes; overdue items → <em>worried</em>; after 23:00 →{' '}
        <em>tired</em>; otherwise <em>idle</em>. Clicking the pet anywhere gives it a cheer.
      </div>
    </div>
  )
}
