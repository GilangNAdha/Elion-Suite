import { useEffect, useRef } from 'react'
import { useMusicStore } from '../../stores/musicStore'

/**
 * The single <audio> element backing the shared player state. Mounted once
 * at the app root so the Music page and the Lockdown music widget (same
 * store, §7) always agree. YouTube tracks render iframes at their mount
 * points; file tracks play through this element.
 */
export function MusicPlayerCore() {
  const ref = useRef<HTMLAudioElement>(null)
  const { tracks, currentId, playing, volume, seekSignal, setPosition, setDuration, setPlaying } = useMusicStore()
  const current = tracks.find((t) => t.id === currentId)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    if (current?.kind === 'file') {
      if (a.src !== current.src) {
        a.src = current.src
      }
      if (playing) void a.play().catch(() => setPlaying(false))
      else a.pause()
    } else {
      a.pause()
    }
  }, [current, playing, setPlaying])

  useEffect(() => {
    const a = ref.current
    if (a && current?.kind === 'file' && seekSignal > 0) a.currentTime = useMusicStore.getState().position
  }, [seekSignal, current])

  useEffect(() => {
    if (ref.current) ref.current.volume = volume
  }, [volume])

  if (!current || current.kind !== 'file') return <audio ref={ref} className="hidden" />
  return (
    <audio
      ref={ref}
      onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
      onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
      onEnded={() => {
        const t = useMusicStore.getState().tracks
        if (t.length > 1) {
          const i = t.findIndex((x) => x.id === currentId)
          useMusicStore.getState().select(t[(i + 1) % t.length].id)
        } else {
          setPlaying(false)
        }
      }}
    />
  )
}
