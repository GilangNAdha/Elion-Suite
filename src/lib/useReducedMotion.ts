import { useEffect, useState } from 'react'
import { useThemeStore } from '../stores/themeStore'

export function useReducedMotion(): boolean {
  const inApp = useThemeStore((s) => s.reducedMotion)
  const [system, setSystem] = useState(
    () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystem(query.matches)
    const change = (e: MediaQueryListEvent) => setSystem(e.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return inApp || system
}
