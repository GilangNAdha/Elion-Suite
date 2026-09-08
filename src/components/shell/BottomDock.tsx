// Motion-value distance/spring interaction adapted from React Bits / Dock.
// Copyright David Haz. See third-party/react-bits/LICENSE.md.
// Elion uses real route links and transform-only magnification, not resizing.
import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  AnimatePresence,
  type MotionValue
} from 'motion/react'
import { LayoutDashboard, Blocks, NotebookPen, Music2, Lock } from 'lucide-react'
import { useReducedMotion } from '../../lib/useReducedMotion'
const DOCK = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspace', label: 'Workspace', icon: Blocks },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/music', label: 'Music', icon: Music2 },
  { to: '/lockdown', label: 'Lockdown', icon: Lock }
]
function DockItem({
  item,
  mouseX,
  reduced
}: {
  item: (typeof DOCK)[number]
  mouseX: MotionValue<number>
  reduced: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const distance = useTransform(mouseX, (x) => {
    const box = ref.current?.getBoundingClientRect()
    return box ? x - box.x - box.width / 2 : Infinity
  })
  const target = useTransform(distance, [-120, 0, 120], [1, 1.42, 1])
  const scale = useSpring(target, { mass: 0.2, stiffness: 290, damping: 25 })
  return (
    <div
      ref={ref}
      className="dock-slot"
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
    >
      <motion.div className="dock-icon-motion" style={{ scale: reduced ? 1 : scale }}>
        <NavLink
          to={item.to}
          end={item.to === '/'}
          aria-label={item.label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={({ isActive }) => `dock-link ${isActive ? 'is-active' : ''}`}
        >
          <item.icon size={18} strokeWidth={1.6} />
        </NavLink>
      </motion.div>
      <AnimatePresence>
        {focused && (
          <motion.span
            className="dock-tooltip"
            role="tooltip"
            initial={{ opacity: 0, y: reduced ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
export function BottomDock() {
  const mouseX = useMotionValue(Infinity)
  const reduced = useReducedMotion()
  return (
    <nav
      aria-label="Quick dock"
      className="quick-dock bits-dock"
      data-motion={reduced ? 'off' : 'on'}
      onMouseMove={(event) => {
        if (!reduced) mouseX.set(event.clientX)
      }}
      onMouseLeave={() => mouseX.set(Infinity)}
    >
      {DOCK.map((item) => (
        <DockItem key={item.to} item={item} mouseX={mouseX} reduced={reduced} />
      ))}
    </nav>
  )
}
