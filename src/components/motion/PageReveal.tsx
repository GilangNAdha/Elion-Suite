import { motion } from 'motion/react'
import type { PropsWithChildren } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'

export function PageReveal({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
