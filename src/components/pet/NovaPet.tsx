import { assetUrl } from '../../lib/assets'
import { usePetStore } from '../../stores/petStore'
import { useCompanionStore } from '../../stores/companionStore'
import { usePixelClock } from './PixelSprite'
import type { PetMoodState } from '../../lib/types'

export type NovaPose = 'idle' | 'happy' | 'thinking' | 'talking' | 'working' | 'sleeping' | 'wave'
const ROWS: NovaPose[] = ['idle', 'happy', 'thinking', 'talking', 'working', 'sleeping', 'wave']
export function NovaPet({
  size = 128,
  mood,
  pose
}: {
  size?: number
  mood?: PetMoodState['mood']
  pose?: NovaPose
}) {
  const sharedMood = usePetStore((state) => state.mood)
  const activity = useCompanionStore((state) => state.activity)
  const animations = useCompanionStore((state) => state.animations)
  const resting = useCompanionStore((state) => state.resting)
  const reaction = useCompanionStore((state) => state.reaction)
  const { tick, reduced } = usePixelClock(!animations)
  const feeling = mood ?? sharedMood
  const state: NovaPose = resting
    ? 'sleeping'
    : (reaction?.pose ??
      pose ??
      (activity !== 'idle'
        ? activity
        : feeling === 'focused'
          ? 'working'
          : feeling === 'happy'
            ? 'happy'
            : feeling === 'tired'
              ? 'sleeping'
              : 'idle'))
  const frame = reduced ? 0 : Math.floor(tick / (state === 'talking' ? 1 : 2)) % 8
  return (
    <div
      className="nova-pet"
      style={{ width: `${size / 16}rem` }}
      role="img"
      aria-label={`Elion, your animated friend, ${state}`}
      data-pose={state}
      data-animated={!reduced}
    >
      <span className="nova-ground" aria-hidden="true" />
      <svg className="nova-sprite" viewBox="0 0 64 64" aria-hidden="true" data-frame={frame}>
        <image
          href={assetUrl('pet/nova-sprites.png')}
          x={-frame * 64}
          y={-ROWS.indexOf(state) * 64}
          width="512"
          height="448"
        />
      </svg>
    </div>
  )
}
