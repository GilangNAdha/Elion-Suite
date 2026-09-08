import { assetUrl } from '../../lib/assets'
import { Suspense, lazy, useEffect, useState } from 'react'
import type { WallpaperConfig } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { useReducedMotion } from '../../lib/useReducedMotion'
export { useReducedMotion } from '../../lib/useReducedMotion'

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

function useWallpaperUrl(blobId?: string) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let current: string | null = null
    setUrl(null)
    if (blobId)
      void useLockdownStore
        .getState()
        .getBlob(blobId)
        .then((blob) => {
          if (!alive || !blob) return
          current = URL.createObjectURL(blob.data)
          setUrl(current)
        })
        .catch(() => {
          if (alive) setUrl(null)
        })
    return () => {
      alive = false
      if (current) URL.revokeObjectURL(current)
    }
  }, [blobId])
  return url
}

/** Static / local video / R3F, with both system and in-app motion fallbacks. */
export function Wallpaper({ config }: { config: WallpaperConfig }) {
  const reduced = useReducedMotion()
  const url = useWallpaperUrl(config.blobId)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  const builtin = assetUrl(`wallpapers/${config.builtin ?? 'nocturne'}.jpg`)
  if (config.tier === 'scene3d' && !reduced)
    return (
      <Suspense fallback={<StaticFallback />}>
        <Scene3D kind={config.scene} />
      </Suspense>
    )
  if (config.tier === 'video' && url && !failed && !reduced)
    return (
      <video
        className="wallpaper-image"
        src={url}
        muted
        autoPlay
        loop
        playsInline
        onError={() => setFailed(true)}
        aria-hidden="true"
      />
    )
  return (
    <img
      className={`wallpaper-image ${url && config.tier === 'static' && !failed ? '' : 'builtin-wallpaper'}`}
      src={url && config.tier === 'static' && !failed ? url : builtin}
      onError={() => setFailed(true)}
      alt=""
      aria-hidden="true"
    />
  )
}

export function StaticFallback({ kind }: { kind?: string }) {
  return (
    <img
      src={assetUrl('wallpapers/nocturne.jpg')}
      className="wallpaper-image builtin-wallpaper"
      alt=""
      aria-hidden="true"
    />
  )
}
