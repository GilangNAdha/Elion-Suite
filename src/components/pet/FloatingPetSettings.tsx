import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { PawPrint, Hand, MessageCircle, RotateCcw } from 'lucide-react'
import { useCompanionStore } from '../../stores/companionStore'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { Button, Toggle } from '../ui'

export function FloatingPetSettings() {
  const enabled = useCompanionStore((state) => state.pinned)
  const animations = useCompanionStore((state) => state.animations)
  const connection = useCompanionStore((state) => state.connection)
  const reduced = useReducedMotion()
  const section = useRef<HTMLElement>(null)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#companion') return
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [hash])
  return (
    <section
      ref={section}
      id="companion"
      className="pet-settings-panel"
      aria-labelledby="floating-pet-heading"
    >
      <header>
        <PawPrint size={17} />
        <h2 id="floating-pet-heading">Floating pet</h2>
        <span className={enabled ? 'is-enabled' : ''}>{enabled ? 'Active' : 'Off'}</span>
      </header>
      <p>
        Nova lives above the app, not in a separate tab. Keep it beside you on any screen, including Settings
        and Lockdown.
      </p>
      <Toggle
        label="Enable floating pet"
        hint="Click Nova for interactions, or drag the pet itself to move it. Your choice is saved on this device."
        checked={enabled}
        onChange={useCompanionStore.getState().setPinned}
      />
      <Toggle
        label="Animate pet"
        hint="Breathing, blinking, waving, typing and sleep animations. Interactions still work when animation is off."
        checked={animations}
        onChange={useCompanionStore.getState().setAnimations}
      />
      {reduced && (
        <p className="pet-motion-note">
          Your system or app reduced-motion preference takes priority over pet animation.
        </p>
      )}
      <div className="pet-settings-actions">
        <Button
          size="sm"
          disabled={!enabled}
          icon={<Hand size={14} />}
          onClick={() => useCompanionStore.getState().setControlsOpen(true)}
        >
          Show pet controls
        </Button>
        <Button
          size="sm"
          disabled={!enabled}
          icon={<MessageCircle size={14} />}
          onClick={() => useCompanionStore.getState().setOpen(true)}
        >
          Open pet chat
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!enabled}
          icon={<RotateCcw size={13} />}
          onClick={useCompanionStore.getState().resetPosition}
        >
          Reset pet position
        </Button>
      </div>
      <div className="pet-settings-note">
        <span className={`pet-model-dot ${connection === 'ready' ? 'is-connected' : ''}`} />
        <p>
          {connection === 'ready' ? 'MiniCPM is connected.' : 'Chat can optionally connect to MiniCPM.'}{' '}
          Patting, waving, sleeping and moving the pet do not need a model.
        </p>
      </div>
    </section>
  )
}
