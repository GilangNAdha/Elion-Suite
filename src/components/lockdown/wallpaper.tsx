import { Suspense, lazy, useEffect, useState } from 'react'
import type { WallpaperConfig } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { useThemeStore } from '../../stores/themeStore'
import { deriveTheme } from '../../tokens/theme'

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

/**
 * Three-tier wallpaper system (§8.3): static image / looping video / 3D scene.
 * 3D always ships a static fallback for reduced motion (§11 #4).
 */
export function Wallpaper({ config }: { config: WallpaperConfig }) {
  const reducedMotion = useReducedMotion()

  if (config.tier === 'video') {
    return <VideoWallpaper blobId={config.blobId} />
  }
  if (config.tier === 'scene3d') {
    if (reducedMotion) return <StaticFallback kind={config.scene} />
    return (
      <Suspense fallback={<StaticFallback kind={config.scene} />}>
        <Scene3D kind={config.scene} />
      </Suspense>
    )
  }
  return <StaticWallpaper blobId={config.blobId} />
}

export function useReducedMotion(): boolean {
  const inApp = useThemeStore((s) => s.reducedMotion)
  const [system, setSystem] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystem(mq.matches)
    const cb = (e: MediaQueryListEvent) => setSystem(e.matches)
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  }, [])
  return inApp || system
}

function StaticWallpaper({ blobId }: { blobId?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const theme = useThemeStore((s) => s.theme)
  const resolved = deriveTheme(theme)

  useEffect(() => {
    let alive = true
    let u: string | null = null
    if (blobId) {
      void useLockdownStore.getState().getBlob(blobId).then((b) => {
        if (!alive || !b) return
        u = URL.createObjectURL(b.data)
        if (alive) setUrl(u)
      })
    }
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [blobId])

  if (url) {
    return <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
  }
  // built-in theme-derived scene (deliberate, not an AI gradient)
  return (
    <div className="absolute inset-0" style={{ background: 'var(--bg)' }} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(1200px 600px at 20% 10%, ${resolved.chart[0]}26, transparent 60%),
            radial-gradient(900px 500px at 85% 25%, ${resolved.chart[1]}1f, transparent 55%),
            radial-gradient(1000px 700px at 50% 110%, ${resolved.chart[4]}22, transparent 60%)
          `
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: 'radial-gradient(var(--line-strong) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }}
      />
    </div>
  )
}

function VideoWallpaper({ blobId }: { blobId?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    let u: string | null = null
    if (blobId) {
      void useLockdownStore.getState().getBlob(blobId).then((b) => {
        if (!alive || !b) return
        u = URL.createObjectURL(b.data)
        if (alive) setUrl(u)
      })
    }
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [blobId])

  if (!url || failed) return <StaticWallpaper blobId={undefined} />
  return (
    <video
      key={url}
      src={url}
      autoPlay
      loop
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

/** Static image fallback for 3D scenes under reduced motion. */
export function StaticFallback({ kind }: { kind?: string }) {
  const theme = useThemeStore((s) => s.theme)
  const resolved = deriveTheme(theme)
  const [c1, c2, c3, c4, c5] = [resolved.chart[0], resolved.chart[1], resolved.chart[2], resolved.chart[3], resolved.chart[4]]
  return (
    <div className="absolute inset-0" style={{ background: 'var(--bg)' }} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            kind === 'gradient'
              ? `linear-gradient(160deg, ${c1}30, transparent 45%), linear-gradient(20deg, ${c2}2b, transparent 50%), linear-gradient(300deg, ${c4}26, transparent 55%)`
              : `radial-gradient(900px 500px at 30% 30%, ${c1}33, transparent 60%), radial-gradient(700px 400px at 75% 65%, ${c2}2b, transparent 55%)`
        }}
      />
      {kind !== 'gradient' && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(${c3} 1.2px, transparent 1.6px), radial-gradient(${c5} 1px, transparent 1.4px)`,
            backgroundSize: '90px 90px, 140px 140px',
            backgroundPosition: '0 0, 40px 60px'
          }}
        />
      )}
    </div>
  )
}
