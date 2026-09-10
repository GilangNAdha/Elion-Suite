import { useSettingsStore } from '../../stores/settingsStore'
import type { PetMoodState } from '../../lib/types'
import { DuelPet } from './DuelPet'
import { NovaPet } from './NovaPet'

/** Elion (formerly "Nova") is the default friend. Opt-in duel blocks remain available. */
export function Pet({ mood, size = 120 }: { mood?: PetMoodState['mood']; size?: number }) {
  const style = useSettingsStore((state) => state.petStyle)
  if (style === 'duel')
    return (
      <div className="pet-duel-wrap" style={{ width: `min(100%, ${(Math.max(size, 160) * 1.9) / 16}rem)` }}>
        <DuelPet mood={mood} compact />
      </div>
    )
  return <NovaPet mood={mood} size={size} />
}
// Kept for old settings/import consumers. It now renders the new companion.
export const ClassicPet = NovaPet
