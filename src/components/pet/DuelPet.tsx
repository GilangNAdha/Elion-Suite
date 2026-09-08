import { usePetStore } from '../../stores/petStore'
import type { PetMoodState } from '../../lib/types'
import { PixelSprite, usePixelClock, duelPose } from './PixelSprite'

/** 48 genuine transparent sprite frames over a native-resolution pixel stage.
 * The shared mood selects the choreography; no animated static cut-outs. */
export function DuelPet({
  mood,
  compact = false,
  className = ''
}: {
  mood?: PetMoodState['mood']
  compact?: boolean
  className?: string
}) {
  const storeMood = usePetStore((s) => s.mood)
  const { tick, reduced } = usePixelClock()
  const m = mood ?? storeMood
  const pose = duelPose(tick, m === 'idle' || m === 'tired' || reduced)
  const flyby = !reduced && (m === 'happy' || m === 'focused') && tick % 288 > 225
  return (
    <div
      className={`duel-stage ${compact ? 'duel-compact' : ''} ${className}`}
      data-mood={m}
      data-animated={!reduced}
      role="img"
      aria-label={`Animated pixel duel: Black Knight and White Knight, feeling ${m}`}
    >
      <div className="duel-snow-court" aria-hidden="true" />
      <div className="duel-actor duel-black" style={{ left: `${21 + pose.travel * 10}%` }}>
        <PixelSprite kind="black" frame={pose.black} />
      </div>
      <div className="duel-actor duel-white" style={{ right: `${14 + pose.travel * 10}%` }}>
        <PixelSprite kind="white" frame={pose.white} mirror />
      </div>
      {pose.impact && (
        <svg className="pixel-impact" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M10 0h4v8l6-5 2 3-7 5h9v3h-9l6 6-3 2-5-7v9h-3v-9l-6 6-2-3 7-5H0v-3h8L3 4l3-2 4 7Z"
            fill="var(--paper)"
          />
        </svg>
      )}
      {flyby && (
        <svg
          className="pixel-dragon"
          style={{ left: `${((tick % 288) - 225) * 2 - 20}%` }}
          viewBox="0 0 64 32"
          aria-hidden="true"
        >
          <path
            d={
              tick % 6 < 3
                ? 'M0 8 12 11 23 17 25 9 17 0 32 7 36 16 44 13 49 8 54 9 58 14 64 15 60 18 51 18 45 22 33 24 24 23 12 17Z'
                : 'M0 8 12 11 23 17 25 24 18 31 34 27 37 20 44 13 49 8 54 9 58 14 64 15 60 18 51 18 45 22 33 24 24 23 12 17Z'
            }
            fill="var(--void)"
          />
        </svg>
      )}
      <div className={`pixel-weather ${m === 'worried' ? 'pixel-rain' : ''}`} aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37 + tick / 2) % 100}%`,
              top: `${(i * 23 + tick * (m === 'worried' ? 4 : 0.7)) % 100}%`
            }}
          />
        ))}
      </div>
      <span className="duel-scene-label">Snow Court</span>
    </div>
  )
}
