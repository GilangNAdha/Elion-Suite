// Adapted from React Bits / StarBorder, copyright David Haz.
// Kept as a native button; illustration layers cannot intercept interaction.
// See third-party/react-bits/LICENSE.md.
import type { ButtonHTMLAttributes } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'

export function StarBorder({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const reduced = useReducedMotion()
  return (
    <button
      type="button"
      {...props}
      className={`star-button focus-ring ${className}`}
      data-effects={reduced ? 'off' : 'on'}
    >
      <span className="star-streak star-streak-bottom" aria-hidden="true" />
      <span className="star-streak star-streak-top" aria-hidden="true" />
      <span className="star-button-content">{children}</span>
    </button>
  )
}
