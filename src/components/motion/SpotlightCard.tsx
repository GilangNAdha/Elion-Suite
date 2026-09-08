// Adapted from React Bits / SpotlightCard, copyright David Haz.
// Application-specific version; see third-party/react-bits/LICENSE.md.
import { useRef, type HTMLAttributes } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'

export function SpotlightCard({
  as: Tag = 'div',
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'section' }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  return (
    <Tag
      {...props}
      ref={ref}
      className={`spotlight-surface ${className}`}
      data-effects={reduced ? 'off' : 'on'}
      onPointerMove={(event) => {
        if (reduced || event.pointerType === 'touch' || !ref.current) return
        const rect = ref.current.getBoundingClientRect()
        ref.current.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`)
        ref.current.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`)
      }}
    >
      <span className="spotlight-wash" aria-hidden="true" />
      {children}
    </Tag>
  )
}
