import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { motion, useMotionValue, useDragControls, AnimatePresence } from 'motion/react'
import { GripHorizontal, MessageCircle, X, Hand, Heart, Moon, Sun, Settings } from 'lucide-react'
import { useCompanionStore } from '../../stores/companionStore'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { petBounds, positionToPoint, pointToPosition, petPopover, clamp } from '../../lib/companionPosition'
import { PET_LAYOUT } from '../../tokens/tokens'
import { voiceDictation } from '../../lib/voice/VoiceDictationService'
import { NovaPet } from './NovaPet'
import { CompanionChat } from './CompanionChat'
import { IconBtn } from '../ui'

function readViewport() {
  return {
    width: window.innerWidth,
    height: Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight)
  }
}

/** One root-mounted overlay, including Dashboard, Settings and immersive routes.
 * Its activation/animation preferences live in Settings; it never opens a pet page. */
export function FloatingCompanion() {
  const state = useCompanionStore(
    useShallow((s) => ({
      pinned: s.pinned,
      open: s.open,
      controlsOpen: s.controlsOpen,
      resting: s.resting,
      animations: s.animations,
      position: s.position,
      activity: s.activity,
      reaction: s.reaction,
      setOpen: s.setOpen,
      setPinned: s.setPinned,
      setPosition: s.setPosition,
      setControlsOpen: s.setControlsOpen,
      setResting: s.setResting,
      interact: s.interact
    }))
  )
  const pathname = useLocation().pathname
  const navigate = useNavigate()
  const reduced = useReducedMotion() || !state.animations
  const dragControls = useDragControls()
  const pet = useRef<HTMLDivElement>(null)
  const avatar = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const firstAction = useRef<HTMLButtonElement>(null)
  const dragged = useRef(false)
  const resetDrag = useRef<ReturnType<typeof setTimeout>>()
  const [viewport, setViewport] = useState(readViewport)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const size =
    pathname === '/lockdown'
      ? PET_LAYOUT.focusSize
      : viewport.width < PET_LAYOUT.compactBreakpoint
        ? PET_LAYOUT.compactSize
        : PET_LAYOUT.desktopSize
  const bounds = petBounds(viewport, size)
  const point = positionToPoint(state.position, bounds)
  const x = useMotionValue(point.x)
  const y = useMotionValue(point.y)
  const popup = petPopover(viewport, point, size, state.open)

  useEffect(() => {
    const resize = () => setViewport(readViewport())
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      clearTimeout(resetDrag.current)
    }
  }, [])
  useEffect(() => {
    x.set(point.x)
    y.set(point.y)
  }, [point.x, point.y, x, y])
  useEffect(() => {
    if (!state.pinned) {
      setHovered(false)
      setDragging(false)
    }
  }, [state.pinned])
  useEffect(() => {
    if (!state.controlsOpen || !state.pinned || dragging) return
    firstAction.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!pet.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node))
        state.setControlsOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [state.controlsOpen, state.pinned, dragging, state.setControlsOpen])

  if (!state.pinned) return null

  const place = () => {
    const next = {
      x: clamp(x.get(), bounds.left, bounds.right),
      y: clamp(y.get(), bounds.top, bounds.bottom)
    }
    x.set(next.x)
    y.set(next.y)
    state.setPosition(pointToPosition(next, bounds))
  }
  const closePanel = () => {
    state.setControlsOpen(false)
    if (state.open) state.setOpen(false)
    avatar.current?.focus({ preventScroll: true })
  }
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // Escape cancels active dictation before dismissing the surrounding chat.
    if (['listening', 'requesting', 'processing', 'downloading'].includes(voiceDictation.getSnapshot().phase))
      return
    event.preventDefault()
    event.stopPropagation()
    closePanel()
  }
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    dragged.current = false
    dragControls.start(event)
  }
  const toggleControls = () => {
    if (dragged.current) return
    if (state.open) closePanel()
    else state.setControlsOpen(!state.controlsOpen)
  }
  const status = state.resting
    ? 'Resting'
    : state.activity === 'thinking'
      ? 'Thinking…'
      : state.activity === 'talking'
        ? 'Replying…'
        : 'Here with you'

  return (
    <>
      <motion.div
        ref={pet}
        className="floating-nova"
        style={{ x, y, width: `${size / 16}rem` }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={bounds}
        onDragStart={() => {
          dragged.current = true
          setDragging(true)
        }}
        onDragEnd={() => {
          place()
          setDragging(false)
          clearTimeout(resetDrag.current)
          resetDrag.current = setTimeout(() => {
            dragged.current = false
          }, 0)
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerLeave={() => setHovered(false)}
        data-companion="nova"
        data-dragging={dragging}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.15 }}
      >
        <div className="floating-nova-tools">
          <button
            type="button"
            aria-label="Move Elion"
            title="Drag Elion, or use the arrow keys"
            onPointerDown={startDrag}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
              event.preventDefault()
              x.set(
                x.get() +
                  (event.key === 'ArrowLeft'
                    ? -PET_LAYOUT.keyboardStep
                    : event.key === 'ArrowRight'
                      ? PET_LAYOUT.keyboardStep
                      : 0)
              )
              y.set(
                y.get() +
                  (event.key === 'ArrowUp'
                    ? -PET_LAYOUT.keyboardStep
                    : event.key === 'ArrowDown'
                      ? PET_LAYOUT.keyboardStep
                      : 0)
              )
              place()
            }}
          >
            <GripHorizontal size={14} />
          </button>
          <button
            type="button"
            aria-label="Hide Elion"
            title="Hide Elion — turn it back on in Settings"
            onClick={() => state.setPinned(false)}
          >
            <X size={12} />
          </button>
        </div>
        <button
          ref={avatar}
          type="button"
          className="floating-nova-avatar"
          aria-label="Interact with Elion"
          aria-haspopup="dialog"
          aria-expanded={state.controlsOpen || state.open}
          aria-controls={state.open ? 'nova-chat-popover' : 'nova-pet-controls'}
          onPointerDown={startDrag}
          onClick={toggleControls}
          onContextMenu={(event) => {
            event.preventDefault()
            state.setControlsOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') dragged.current = false
          }}
        >
          <NovaPet
            size={size}
            pose={state.activity === 'idle' && !state.resting && hovered ? 'wave' : undefined}
          />
        </button>
        <button
          type="button"
          className="floating-nova-label"
          aria-label="Open Elion controls"
          onClick={toggleControls}
        >
          {state.resting ? <Moon size={11} /> : <Hand size={11} />}
          {state.activity === 'idle' ? 'Elion' : status}
        </button>
        <AnimatePresence>
          {state.reaction && (
            <motion.div
              key={state.reaction.key}
              className="nova-interaction-feedback"
              role="status"
              initial={reduced ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: reduced ? 0 : -3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.15 }}
            >
              {state.reaction.pose === 'happy' ? <Heart size={13} /> : <Hand size={13} />}
              {state.reaction.label}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {!dragging && (state.controlsOpen || state.open) && (
          <motion.div
            key={state.open ? 'chat' : 'actions'}
            ref={panel}
            id={state.open ? 'nova-chat-popover' : 'nova-pet-controls'}
            className={`floating-nova-popover ${state.open ? 'floating-nova-chat' : 'floating-nova-actions'}`}
            role="dialog"
            aria-label={state.open ? 'Elion chat' : 'Elion controls'}
            onKeyDown={onEscape}
            style={{
              left: popup.x,
              top: popup.y,
              width: popup.width,
              height: state.open ? popup.height : undefined,
              maxHeight: popup.height
            }}
            initial={reduced ? false : { opacity: 0, scale: 0.97, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {state.open ? (
              <CompanionChat compact onClose={closePanel} />
            ) : (
              <>
                <header className="nova-actions-heading">
                  <div>
                    <strong>Elion</strong>
                    <span>{status}</span>
                  </div>
                  <IconBtn label="Close Elion controls" onClick={closePanel}>
                    <X size={14} />
                  </IconBtn>
                </header>
                <div className="nova-actions-grid">
                  <button ref={firstAction} type="button" onClick={() => state.interact('pat')}>
                    <Heart size={15} />
                    High five Elion
                  </button>
                  <button type="button" onClick={() => state.interact('wave')}>
                    <Hand size={15} />
                    Wave hello
                  </button>
                  <button
                    type="button"
                    aria-label={state.resting ? 'Wake Elion' : 'Let Elion rest'}
                    onClick={() => state.setResting(!state.resting)}
                  >
                    {state.resting ? <Sun size={15} /> : <Moon size={15} />}
                    {state.resting ? 'Wake Elion' : 'Let Elion rest'}
                  </button>
                  <button type="button" onClick={() => state.setOpen(true)}>
                    <MessageCircle size={15} />
                    Start a chat
                  </button>
                </div>
                <button
                  type="button"
                  className="nova-pet-settings-link"
                  onClick={() => {
                    state.setControlsOpen(false)
                    navigate('/settings#companion')
                  }}
                >
                  <Settings size={13} />
                  Elion settings
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
