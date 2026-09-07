import { usePetStore } from '../../stores/petStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { PetMoodState } from '../../lib/types'
import { DuelPet } from './DuelPet'

const MOOD_FACE: Record<PetMoodState['mood'], { eyes: string; mouth: string; blush: boolean }> = {
  idle: { eyes: '•', mouth: '‿', blush: false },
  focused: { eyes: '◕', mouth: '‿', blush: false },
  happy: { eyes: '◠', mouth: '‿', blush: true },
  tired: { eyes: '–', mouth: '○', blush: false },
  worried: { eyes: '•', mouth: '⌣', blush: false }
}

const MOOD_TINT: Record<PetMoodState['mood'], string> = {
  idle: 'var(--primary)',
  focused: 'var(--info)',
  happy: 'var(--ok)',
  tired: 'var(--ink-muted)',
  worried: 'var(--warn)'
}

/**
 * Pet companion — one shared component & mood state, mounted on the
 * Dashboard, Pet page, and inside Lockdown (§7). v5: `petStyle` selects
 * between the classic companion and the opt-in Pixel Duel arena (§17).
 */
export function Pet({ mood, size = 120 }: { mood?: PetMoodState['mood']; size?: number }) {
  const petStyle = useSettingsStore((s) => s.petStyle)
  if (petStyle === 'duel') {
    return (
      <div style={{ width: Math.max(size, 160) * 1.6 }}>
        <DuelPet mood={mood} />
      </div>
    )
  }
  return <ClassicPet mood={mood} size={size} />
}

export function ClassicPet({ mood, size = 120 }: { mood?: PetMoodState['mood']; size?: number }) {
  const storeMood = usePetStore((s) => s.mood)
  const m = mood ?? storeMood
  const f = MOOD_FACE[m]
  const tint = MOOD_TINT[m]

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={`Pet is feeling ${m}`}
      className="pet-bob select-none"
    >
      <ellipse cx="60" cy="104" rx="34" ry="7" fill="rgba(0,0,0,0.25)" />
      <path
        d="M60 18 C 92 18, 106 44, 104 68 C 102 94, 84 106, 60 106 C 36 106, 18 94, 16 68 C 14 44, 28 18, 60 18 Z"
        fill="var(--raised)"
        stroke={tint}
        strokeWidth="3"
      />
      <path
        d="M60 22 C 88 22, 101 45, 99 67 C 97 91, 81 102, 60 102 C 39 102, 23 91, 21 67 C 19 45, 32 22, 60 22 Z"
        fill="var(--surface)"
        opacity="0.55"
      />
      {f.blush && (
        <>
          <ellipse cx="38" cy="66" rx="6" ry="3.5" fill="var(--bad)" opacity="0.3" />
          <ellipse cx="82" cy="66" rx="6" ry="3.5" fill="var(--bad)" opacity="0.3" />
        </>
      )}
      <g fill="var(--ink)">
        {m === 'tired' ? (
          <>
            <line x1="36" y1="58" x2="48" y2="58" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
            <line x1="72" y1="58" x2="84" y2="58" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : m === 'happy' ? (
          <>
            <path d="M36 60 Q 42 52 48 60" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M72 60 Q 78 52 84 60" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="42" cy="58" r="4.5" />
            <circle cx="78" cy="58" r="4.5" />
          </>
        )}
      </g>
      <path
        d={f.mouth === '⌣' ? 'M52 78 Q 60 72 68 78' : f.mouth === '○' ? '' : 'M52 74 Q 60 82 68 74'}
        stroke="var(--ink)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {f.mouth === '○' && <circle cx="60" cy="77" r="3.5" fill="none" stroke="var(--ink)" strokeWidth="2.5" />}
      {m === 'focused' && (
        <g opacity="0.9">
          <circle cx="60" cy="34" r="2.2" fill={tint} />
          <circle cx="60" cy="34" r="5" fill="none" stroke={tint} strokeWidth="1" opacity="0.5" />
        </g>
      )}
    </svg>
  )
}
