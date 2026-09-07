import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { deriveTheme, applyThemeCss } from './theme'
import { useThemeStore } from '../stores/themeStore'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme)
  const reduced = useThemeStore((s) => s.reducedMotion)

  const resolved = useMemo(() => deriveTheme(theme), [theme])

  useEffect(() => {
    applyThemeCss(resolved, theme.mode)
    document.documentElement.dataset.reduced = reduced ? '1' : '0'
  }, [resolved, theme.mode, reduced])

  return <>{children}</>
}
