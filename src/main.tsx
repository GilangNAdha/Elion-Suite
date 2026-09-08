import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tokens/foundation.css'
import './styles/globals.css'
import './styles/elion.css'
import './styles/studio.css'
import './styles/companion.css'
import { deriveTheme, applyThemeCss } from './tokens/theme'
import { useThemeStore } from './stores/themeStore'

// Resolve before the splash / first paint; no flash of an old palette.
const initialTheme = useThemeStore.getState().theme
applyThemeCss(deriveTheme(initialTheme), initialTheme.mode)

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)

// PWA service worker (autoUpdate via vite-plugin-pwa)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
